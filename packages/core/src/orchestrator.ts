import type { AgentSession, ChatMessage, ToolExecution } from 'core-types';
import { ActionQueue } from './queue';
import { callOpenAI } from './llm/client';

export class AgentOrchestrator {
  private sessions: Map<string, AgentSession> = new Map();
  readonly queue: ActionQueue;
  
  // Ephemeral storage for raw tool outputs so they don't bloat the persisted session DB
  private sessionToolOutputs: Map<string, Array<{ tool_call_id: string; name: string; content: string }>> = new Map();

  constructor() {
    this.queue = new ActionQueue();
  }

  createSession(projectPath: string, remoteGitUrl?: string): AgentSession {
    const session: AgentSession = {
      id: `session-${Date.now()}`,
      name: `Project: ${projectPath.split('/').pop() ?? 'Unknown'}`,
      createdAt: Date.now(),
      messages: [],
      toolQueue: [],
      projectPath,
      remoteGitUrl,
    };
    this.sessions.set(session.id, session);
    this.sessionToolOutputs.set(session.id, []);
    return session;
  }

  addMessage(sessionId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const message: ChatMessage = {
      ...msg,
      id: `msg-${Date.now()}`,
      timestamp: Date.now(),
    };
    session.messages.push(message);
    return message;
  }

  /**
   * Process a new user message, call the LLM, and enqueue any proposed tools.
   */
  async processUserPrompt(sessionId: string, text: string, apiKey: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    // 1. Add user message
    this.addMessage(sessionId, { role: 'user', content: text });

    // 2. Clear previous ephemeral tool outputs for a fresh context run
    this.sessionToolOutputs.set(sessionId, []);

    // 3. Trigger LLM
    await this.runLlmLoop(sessionId, apiKey);
  }

  /**
   * Internal loop to call the LLM and handle tool batching.
   */
  private async runLlmLoop(sessionId: string, apiKey: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const toolResponses = this.sessionToolOutputs.get(sessionId) ?? [];

    const response = await callOpenAI(apiKey, 'gpt-4o-mini', session.messages, toolResponses);

    if (response.content) {
      this.addMessage(sessionId, { role: 'agent', content: response.content });
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      // LLM proposed a batch of tools. Enqueue them all as pending approval.
      for (const tc of response.toolCalls) {
        let argsObj = {};
        try { argsObj = JSON.parse(tc.arguments); } catch(e) {}
        
        // Format a pretty display string
        const displayArg = argsObj && (argsObj as any).path || (argsObj as any).command || '';
        const commandStr = `${tc.name}(${displayArg})`;

        const tool = this.queue.enqueue({ 
          command: commandStr, 
          toolName: tc.name, 
          toolArgs: argsObj, 
          requiresHost: true 
        });
        
        // We sneak the original tool_call_id into the queue item so we can reference it later
        (tool as any)._llmToolCallId = tc.id;
        (tool as any)._llmToolName = tc.name;

        session.toolQueue.push(tool);
      }
    }
  }

  /**
   * Called by the device executor when a tool finishes (success, failure, or rejection).
   * Appends the result to the context and re-prompts the LLM to continue reasoning.
   */
  async continueSession(sessionId: string, toolId: string, resultString: string, apiKey: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const tool = session.toolQueue.find(t => t.id === toolId);
    if (!tool) throw new Error(`Tool not found: ${toolId}`);

    const llmToolCallId = (tool as any)._llmToolCallId;
    const llmToolName = (tool as any)._llmToolName;

    if (!llmToolCallId) {
      console.warn(`[Orchestrator] Tool ${toolId} lacks LLM tracking ID. Cannot continue loop.`);
      return;
    }

    const outputs = this.sessionToolOutputs.get(sessionId) ?? [];
    
    // Wrap output in markdown to mitigate indirect prompt injection
    const safeOutput = `\`\`\`\n${resultString}\n\`\`\``;
    
    outputs.push({
      tool_call_id: llmToolCallId,
      name: llmToolName,
      content: safeOutput,
    });
    this.sessionToolOutputs.set(sessionId, outputs);

    // Re-trigger the LLM to let it read the tool output and decide the next step
    await this.runLlmLoop(sessionId, apiKey);
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }
}
