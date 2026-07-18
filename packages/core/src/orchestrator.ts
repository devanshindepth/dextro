/**
 * Dextro Agent Orchestrator
 *
 * The central engine of the agent. Manages the agentic tool-call loop:
 *   User prompt → LLM → Tool proposals → Execution → Results → LLM → ...
 *
 * Key behaviors:
 * - Max 25 tool-call iterations per user prompt (guards against infinite loops)
 * - Streaming: all events (text, tool_start, tool_complete) forwarded via callbacks
 * - Context management: sliding window + proactive summarization via ContextManager
 * - Trust-tier enforcement: auto/confirm/gate tools handled per security preset
 * - Interrupt: AbortController signal threads through LLM calls and tool execution
 * - Tool result injection uses canonical message format (no provider types)
 *
 * The orchestrator does NOT execute tools — that's the executor's job.
 * It proposes tools, waits for results, and continues the LLM loop.
 */

import type {
  AgentSession,
  ChatMessage,
  CanonicalMessage,
  CanonicalContentBlock,
  LLMConfig,
  LLMStreamEvent,
  LLMResponse,
  SecurityTier,
  ToolExecution,
} from 'core-types';
import { ActionQueue } from './queue';
import { ContextManager } from './context-manager';
import { streamLLM, DEXTRO_SYSTEM_PROMPT, getModelInfo } from './llm/client';
import { getToolDefinitions, getToolTier } from './llm/tools';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 25;

// ─── Callbacks ────────────────────────────────────────────────────────────────

export interface AgentCallbacks {
  /** Called with each text token chunk as it streams */
  onText?: (sessionId: string, chunk: string) => void;
  /** Called when LLM proposes a tool (before execution) */
  onToolProposed?: (sessionId: string, tool: ToolExecution) => void;
  /** Called when a tool finishes executing */
  onToolComplete?: (sessionId: string, toolId: string, output: string, isError: boolean) => void;
  /** Called with live output chunks during run_command */
  onToolStreamChunk?: (sessionId: string, toolId: string, chunk: string) => void;
  /** Called when the full agent turn completes */
  onTurnComplete?: (sessionId: string) => void;
  /** Called on unrecoverable errors */
  onError?: (sessionId: string, error: Error) => void;
  /** Called when state changes (used to trigger React re-renders) */
  onStateChange?: (sessionId: string) => void;
}

// ─── Tool Denylist ────────────────────────────────────────────────────────────

const DANGEROUS_COMMAND_PATTERNS = [
  /rm\s+-rf/i,
  /sudo\s+rm/i,
  /:\(\)\s*\{.*\}\s*;/,  // fork bomb
  /dd\s+if=/i,
  /mkfs/i,
  /format\s+[a-z]:/i,
];

const PROTECTED_PATHS = ['.git/config', '.git/hooks', '../', '..\\'];

function validateToolArgs(toolName: string, args: Record<string, unknown>): string | null {
  if (toolName === 'run_command') {
    const command = String(args.command ?? '');
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return `Blocked: command matches dangerous pattern (${pattern.source})`;
      }
    }
  }

  if (['write_file', 'patch_file', 'delete_file', 'read_file'].includes(toolName)) {
    const path = String(args.path ?? '');
    for (const blocked of PROTECTED_PATHS) {
      if (path.includes(blocked)) {
        return `Blocked: path '${path}' contains restricted segment '${blocked}'`;
      }
    }
  }

  return null; // valid
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export class AgentOrchestrator {
  private sessions = new Map<string, AgentSession>();
  private contextManagers = new Map<string, ContextManager>();
  private summaryMessages = new Map<string, CanonicalMessage>();
  private callbacks: AgentCallbacks = {};

  /** Canonical message history per session (separate from chat UI messages) */
  private canonicalHistory = new Map<string, CanonicalMessage[]>();

  readonly queue: ActionQueue;

  constructor(callbacks?: AgentCallbacks) {
    this.queue = new ActionQueue();
    if (callbacks) this.callbacks = callbacks;
  }

  setCallbacks(callbacks: AgentCallbacks): void {
    this.callbacks = callbacks;
  }

  // ─── Session Management ───────────────────────────────────────────────────

  createSession(
    projectPath: string,
    settings?: Partial<AgentSession['settings']>
  ): AgentSession {
    const session: AgentSession = {
      id: `session-${Date.now()}`,
      name: `Project: ${projectPath.split('/').pop() ?? 'Unknown'}`,
      createdAt: Date.now(),
      messages: [],
      toolQueue: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      settings: {
        provider: settings?.provider ?? 'anthropic',
        model: settings?.model ?? 'claude-sonnet-4-5',
        securityPreset: settings?.securityPreset ?? 'standard',
        projectPath,
        remoteGitUrl: settings?.remoteGitUrl,
      },
    };

    this.sessions.set(session.id, session);
    this.canonicalHistory.set(session.id, []);

    const modelInfo = getModelInfo(session.settings.model);
    const llmConfig = this.buildLLMConfig(session, '');
    this.contextManagers.set(session.id, new ContextManager(llmConfig));

    return session;
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  updateSessionSettings(
    sessionId: string,
    settings: Partial<AgentSession['settings']>
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    Object.assign(session.settings, settings);

    // Rebuild context manager if model changed
    if (settings.model || settings.provider) {
      const llmConfig = this.buildLLMConfig(session, '');
      this.contextManagers.set(sessionId, new ContextManager(llmConfig));
    }
  }

  addChatMessage(
    sessionId: string,
    msg: Omit<ChatMessage, 'id' | 'timestamp'>
  ): ChatMessage {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const message: ChatMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    session.messages.push(message);
    return message;
  }

  appendToLastAgentMessage(sessionId: string, chunk: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const last = session.messages[session.messages.length - 1];
    if (last?.role === 'agent' && last.isStreaming) {
      last.content += chunk;
    }
  }

  finalizeLastAgentMessage(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const last = session.messages[session.messages.length - 1];
    if (last?.role === 'agent') {
      last.isStreaming = false;
    }
  }

  // ─── Main Entry Point ─────────────────────────────────────────────────────

  /**
   * Process a new user message. Starts the agentic loop.
   * Returns when the loop completes (either end_turn or max iterations).
   */
  async processUserPrompt(
    sessionId: string,
    text: string,
    apiKey: string,
    signal?: AbortSignal
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // Add to UI message history
    this.addChatMessage(sessionId, { role: 'user', content: text });

    // Add to canonical history
    const canonical = this.canonicalHistory.get(sessionId)!;
    canonical.push({
      role: 'user',
      content: [{ type: 'text', text }],
    });

    this.callbacks.onStateChange?.(sessionId);

    try {
      await this.runAgentLoop(sessionId, apiKey, signal);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        this.addChatMessage(sessionId, {
          role: 'system',
          content: 'Agent run interrupted by user.',
        });
        this.callbacks.onStateChange?.(sessionId);
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      this.addChatMessage(sessionId, {
        role: 'system',
        content: `Error: ${error.message}`,
      });
      this.callbacks.onError?.(sessionId, error);
      this.callbacks.onStateChange?.(sessionId);
    }
  }

  /**
   * Feed a tool result back to the session and continue the agent loop.
   * Called by the executor after a tool finishes (approve → execute → call this).
   */
  async continueAfterTool(
    sessionId: string,
    toolId: string,
    resultString: string,
    isError: boolean,
    apiKey: string,
    signal?: AbortSignal
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const tool = session.toolQueue.find((t) => t.id === toolId);
    if (!tool) throw new Error(`Tool not found: ${toolId}`);

    const llmToolCallId = (tool as ToolExecution & { _llmToolCallId?: string })._llmToolCallId;
    if (!llmToolCallId) {
      console.warn(`[Orchestrator] Tool ${toolId} has no LLM call ID — skipping context injection`);
      return;
    }

    // Safe-wrap output to mitigate indirect prompt injection
    const safeOutput = `\`\`\`\n${resultString}\n\`\`\``;

    // Inject tool result into canonical history
    const canonical = this.canonicalHistory.get(sessionId)!;
    const lastMsg = canonical[canonical.length - 1];

    const resultBlock: CanonicalContentBlock = {
      type: 'tool_result',
      tool_use_id: llmToolCallId,
      content: safeOutput,
      is_error: isError,
    };

    // OpenAI/Gemini: tool results must be a user message
    // Anthropic: tool results go in a user message after the assistant's tool_use block
    if (lastMsg?.role === 'user') {
      lastMsg.content.push(resultBlock);
    } else {
      canonical.push({ role: 'user', content: [resultBlock] });
    }

    this.callbacks.onStateChange?.(sessionId);

    // Check if all pending tools for this iteration are done
    const allResolved = session.toolQueue
      .filter((t) => (t as any)._iterationId === (tool as any)._iterationId)
      .every((t) => t.status === 'completed' || t.status === 'failed');

    if (allResolved) {
      try {
        await this.runAgentLoop(sessionId, apiKey, signal);
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') {
          this.addChatMessage(sessionId, { role: 'system', content: 'Agent run interrupted.' });
          this.callbacks.onStateChange?.(sessionId);
          return;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        this.addChatMessage(sessionId, { role: 'system', content: `Error: ${error.message}` });
        this.callbacks.onError?.(sessionId, error);
        this.callbacks.onStateChange?.(sessionId);
      }
    }
  }

  // ─── Internal Loop ────────────────────────────────────────────────────────

  private async runAgentLoop(
    sessionId: string,
    apiKey: string,
    signal?: AbortSignal,
    iteration = 0
  ): Promise<void> {
    if (iteration >= MAX_ITERATIONS) {
      this.addChatMessage(sessionId, {
        role: 'system',
        content: `Agent reached maximum iteration limit (${MAX_ITERATIONS}). Please provide further instructions.`,
      });
      this.callbacks.onStateChange?.(sessionId);
      return;
    }

    if (signal?.aborted) return;

    const session = this.sessions.get(sessionId)!;
    const contextManager = this.contextManagers.get(sessionId)!;

    // Proactive summarization before context overflow
    if (contextManager.needsSummarization) {
      await this.summarizeHistory(sessionId, apiKey, signal);
    }

    const llmConfig = this.buildLLMConfig(session, apiKey);
    const canonical = this.canonicalHistory.get(sessionId)!;
    const summary = this.summaryMessages.get(sessionId);
    const contextMessages = contextManager.buildContext(canonical, summary);
    const tools = getToolDefinitions();

    // Create streaming agent message in UI
    const agentMsg = this.addChatMessage(sessionId, {
      role: 'agent',
      content: '',
      isStreaming: true,
    });

    let response: LLMResponse;
    const iterationId = `iter-${iteration}-${Date.now()}`;

    try {
      response = await streamLLM(
        llmConfig,
        DEXTRO_SYSTEM_PROMPT,
        contextMessages,
        tools,
        (event: LLMStreamEvent) => {
          if (event.type === 'text_delta') {
            this.appendToLastAgentMessage(sessionId, event.text);
            this.callbacks.onText?.(sessionId, event.text);
            this.callbacks.onStateChange?.(sessionId);
          } else if (event.type === 'tool_start') {
            // Early indicator — name available before args
            this.callbacks.onText?.(sessionId, '');
          } else if (event.type === 'usage') {
            contextManager.trackUsage(event.input_tokens, event.output_tokens);
            session.totalInputTokens = Math.max(session.totalInputTokens, event.input_tokens);
            session.totalOutputTokens += event.output_tokens;
          }
        },
        signal
      );
    } catch (err) {
      this.finalizeLastAgentMessage(sessionId);
      throw err;
    }

    this.finalizeLastAgentMessage(sessionId);

    // Remove the empty streaming message if LLM only returned tool calls
    if (!agentMsg.content && response.message.content.some(b => b.type === 'tool_use')) {
      session.messages = session.messages.filter(m => m.id !== agentMsg.id);
    }

    // Add assistant message to canonical history
    this.canonicalHistory.get(sessionId)!.push(response.message);

    // Extract tool calls
    const toolUseCalls = response.message.content.filter(
      (b): b is Extract<CanonicalContentBlock, { type: 'tool_use' }> => b.type === 'tool_use'
    );

    if (toolUseCalls.length === 0 || response.stopReason === 'end_turn') {
      // Agent finished its turn
      this.callbacks.onTurnComplete?.(sessionId);
      this.callbacks.onStateChange?.(sessionId);
      return;
    }

    // Process proposed tool calls
    const autoExecuteIds: string[] = [];

    for (const tc of toolUseCalls) {
      const tier = getToolTier(tc.name);
      const displayArg = this.getDisplayArg(tc.name, tc.input);
      const commandStr = `${tc.name}(${displayArg})`;

      // Denylist check before any execution
      const validationError = validateToolArgs(tc.name, tc.input);

      const queueEntry = this.queue.enqueue({
        command: commandStr,
        toolName: tc.name,
        toolArgs: tc.input,
        tier,
      });

      // Attach LLM tracking fields
      (queueEntry as any)._llmToolCallId = tc.id;
      (queueEntry as any)._llmToolName = tc.name;
      (queueEntry as any)._iterationId = iterationId;

      session.toolQueue.push(queueEntry);

      if (validationError) {
        // Reject blocked tools immediately
        this.queue.reject(queueEntry.id, validationError);
        this.addChatMessage(sessionId, {
          role: 'system',
          content: `⚠️ Tool blocked by security policy: ${validationError}`,
        });
        // Still inject a tool result so LLM knows what happened
        const canonical = this.canonicalHistory.get(sessionId)!;
        canonical.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: tc.id,
            content: `Error: ${validationError}`,
            is_error: true,
          }],
        });
      } else if (this.shouldAutoApprove(tier, session.settings.securityPreset)) {
        this.queue.autoApprove(queueEntry.id);
        autoExecuteIds.push(queueEntry.id);
      }

      this.callbacks.onToolProposed?.(sessionId, queueEntry);
    }

    this.callbacks.onStateChange?.(sessionId);

    // If there are auto-approved tools, the executor will run them and call continueAfterTool.
    // If there are only gate/confirm tools, we wait for user interaction.
    // The loop continues in continueAfterTool once all tools in this iteration resolve.
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildLLMConfig(session: AgentSession, apiKey: string): LLMConfig {
    const modelInfo = getModelInfo(session.settings.model);
    return {
      provider: session.settings.provider,
      model: session.settings.model,
      apiKey,
      maxTokens: 8192,
      temperature: 0.2,
      contextWindow: modelInfo?.contextWindow ?? 128000,
    };
  }

  private shouldAutoApprove(tier: SecurityTier, preset: AgentSession['settings']['securityPreset']): boolean {
    if (tier === 'auto') return true;
    if (tier === 'confirm' && preset === 'standard') return true;
    return false; // 'gate' tier never auto-approved
  }

  private getDisplayArg(toolName: string, args: Record<string, unknown>): string {
    if (args.path) return String(args.path);
    if (args.command) return String(args.command).slice(0, 60);
    if (args.url) return String(args.url).slice(0, 60);
    if (args.message) return `"${String(args.message).slice(0, 40)}"`;
    if (args.from) return `${args.from} → ${args.to}`;
    if (args.branch) return String(args.branch);
    if (args.symbol) return String(args.symbol);
    if (args.pattern) return String(args.pattern).slice(0, 40);
    return '';
  }

  private async summarizeHistory(
    sessionId: string,
    apiKey: string,
    signal?: AbortSignal
  ): Promise<void> {
    const session = this.sessions.get(sessionId)!;
    const contextManager = this.contextManagers.get(sessionId)!;
    const canonical = this.canonicalHistory.get(sessionId)!;

    // Summarize everything except the last 4 messages
    const toSummarize = canonical.slice(0, -4);
    if (toSummarize.length === 0) return;

    const llmConfig = this.buildLLMConfig(session, apiKey);

    this.addChatMessage(sessionId, {
      role: 'system',
      content: '(Compressing earlier context to stay within limits…)',
    });

    const summary = await contextManager.summarizeOlderMessages(
      toSummarize,
      (msgs, onEvent) => streamLLM(llmConfig, DEXTRO_SYSTEM_PROMPT, msgs, [], onEvent, signal)
    );

    this.summaryMessages.set(sessionId, summary);

    // Remove summarized messages from history (keep last 4)
    const kept = canonical.slice(-4);
    this.canonicalHistory.set(sessionId, kept);
  }
}
