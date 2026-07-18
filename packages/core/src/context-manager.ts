/**
 * Dextro Context Manager
 *
 * Manages the token budget for each agent session. Prevents context overflow
 * by maintaining a sliding window of messages and proactively summarizing
 * older turns before the model's context limit is reached.
 *
 * Design principles:
 * - Real token counts from provider API responses are tracked and used for budget math.
 * - Character estimates are ONLY used for pre-call sizing (chars ÷ 4 approximation).
 * - Tool outputs are truncated at 8,000 characters to prevent single outputs from
 *   dominating the context window.
 * - Summarization fires at 85% of the budget, not at 100%, to ensure headroom.
 * - The system prompt and the first user message are ALWAYS retained.
 */

import type { CanonicalMessage, CanonicalContentBlock, LLMConfig } from 'core-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOL_OUTPUT_MAX_CHARS = 8000;
const SUMMARIZATION_THRESHOLD = 0.85; // Fire at 85% of budget
/** Minimum messages to keep in sliding window besides system context */
const MIN_WINDOW_MESSAGES = 4;

// ─── Token Estimation ─────────────────────────────────────────────────────────

/**
 * Rough character-based token estimate. Used ONLY for pre-call sizing.
 * Real token counts from API responses are always preferred for budget tracking.
 * Code tokenizes differently from prose (lower chars/token), so we use 3.5 ratio.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function estimateMessageTokens(msg: CanonicalMessage): number {
  let chars = 0;
  for (const block of msg.content) {
    if (block.type === 'text') chars += block.text.length;
    else if (block.type === 'tool_use') chars += JSON.stringify(block.input).length + block.name.length;
    else if (block.type === 'tool_result') chars += block.content.length;
  }
  // Add ~4 tokens overhead per message for role/formatting
  return Math.ceil(chars / 3.5) + 4;
}

// ─── Tool Output Truncation ───────────────────────────────────────────────────

function truncateToolOutput(content: string): string {
  if (content.length <= TOOL_OUTPUT_MAX_CHARS) return content;

  const kept = content.slice(0, TOOL_OUTPUT_MAX_CHARS);
  const omitted = content.length - TOOL_OUTPUT_MAX_CHARS;
  return `${kept}\n\n[truncated — ${omitted} additional characters omitted to stay within context limits]`;
}

/** Apply truncation to all tool_result blocks in a message */
function truncateMessageOutputs(msg: CanonicalMessage): CanonicalMessage {
  const truncated = msg.content.map((block): CanonicalContentBlock => {
    if (block.type === 'tool_result') {
      return { ...block, content: truncateToolOutput(block.content) };
    }
    return block;
  });
  return { ...msg, content: truncated };
}

// ─── Context Manager ──────────────────────────────────────────────────────────

export class ContextManager {
  private realInputTokens = 0;
  private realOutputTokens = 0;

  constructor(private readonly config: LLMConfig) {}

  get contextWindow(): number {
    return this.config.contextWindow;
  }

  /** Update with real token counts from the provider API response */
  trackUsage(inputTokens: number, outputTokens: number): void {
    this.realInputTokens = Math.max(this.realInputTokens, inputTokens);
    this.realOutputTokens += outputTokens;
  }

  /** Current estimated context usage (in tokens) */
  get currentContextUsage(): number {
    return this.realInputTokens;
  }

  /** Whether we're above the summarization threshold */
  get needsSummarization(): boolean {
    return this.realInputTokens > this.config.contextWindow * SUMMARIZATION_THRESHOLD;
  }

  /**
   * Build the message array to send to the LLM, applying the sliding window.
   *
   * Strategy:
   * 1. Always include the system prompt (handled by router, not here).
   * 2. Always include the first user message.
   * 3. Fill from the end of history backward until budget is reached.
   * 4. If a summary message exists (from prior summarization), include it after
   *    the first message as context anchor.
   * 5. All tool_result blocks are truncated before insertion.
   */
  buildContext(
    messages: CanonicalMessage[],
    summaryMessage?: CanonicalMessage
  ): CanonicalMessage[] {
    if (messages.length === 0) return [];

    // Apply output truncation to all messages first
    const truncated = messages.map(truncateMessageOutputs);

    // Budget: reserve max_tokens for the response, subtract system prompt estimate (~500 tokens)
    const systemOverhead = 500;
    const responseBudget = this.config.maxTokens;
    const availableBudget =
      this.config.contextWindow - systemOverhead - responseBudget;

    // Always keep first user message
    const firstMessage = truncated[0];
    const rest = truncated.slice(1);

    let usedTokens = estimateMessageTokens(firstMessage);
    if (summaryMessage) usedTokens += estimateMessageTokens(summaryMessage);

    // Fill from the end backward
    const windowMessages: CanonicalMessage[] = [];
    for (let i = rest.length - 1; i >= 0; i--) {
      const cost = estimateMessageTokens(rest[i]);
      if (
        usedTokens + cost > availableBudget &&
        windowMessages.length >= MIN_WINDOW_MESSAGES
      ) {
        break;
      }
      windowMessages.unshift(rest[i]);
      usedTokens += cost;
    }

    // Assemble: first message → optional summary → sliding window
    const result: CanonicalMessage[] = [firstMessage];
    if (summaryMessage && windowMessages.length < rest.length) {
      result.push(summaryMessage);
    }
    result.push(...windowMessages);

    return result;
  }

  /**
   * Generate a summary of older messages using the LLM.
   * Called by the orchestrator when needsSummarization is true.
   */
  async summarizeOlderMessages(
    messagesToSummarize: CanonicalMessage[],
    streamLLMFn: (
      messages: CanonicalMessage[],
      onEvent: (e: import('core-types').LLMStreamEvent) => void
    ) => Promise<import('core-types').LLMResponse>
  ): Promise<CanonicalMessage> {
    const summaryPrompt = `Summarize the following conversation history as concisely as possible. Focus on:
- What the user asked for
- What files were read/modified and what changes were made
- What commands were run and their outcomes
- Any errors encountered and how they were resolved
- The current state of the codebase

Be specific about file names and key decisions. This summary will be used as context for continuing the conversation.

Conversation to summarize:
${messagesToSummarize
  .map((m) => {
    const role = m.role === 'assistant' ? 'Agent' : 'User';
    const text = m.content
      .map((b) => {
        if (b.type === 'text') return b.text;
        if (b.type === 'tool_use') return `[Called: ${b.name}(${JSON.stringify(b.input).slice(0, 200)})]`;
        if (b.type === 'tool_result') return `[Result: ${b.content.slice(0, 300)}${b.content.length > 300 ? '...' : ''}]`;
        return '';
      })
      .join(' ');
    return `${role}: ${text}`;
  })
  .join('\n')}`;

    const summaryMessages: CanonicalMessage[] = [
      { role: 'user', content: [{ type: 'text', text: summaryPrompt }] },
    ];

    let summaryText = '';
    await streamLLMFn(summaryMessages, (event) => {
      if (event.type === 'text_delta') summaryText += event.text;
      if (event.type === 'usage') this.trackUsage(event.input_tokens, event.output_tokens);
    });

    return {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `[Context Summary — earlier conversation compressed]\n${summaryText}`,
        },
      ],
    };
  }
}
