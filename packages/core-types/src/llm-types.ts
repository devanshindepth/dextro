/**
 * Dextro Canonical LLM Message Format
 *
 * All providers (Anthropic, OpenAI, Gemini) are adapted TO and FROM this format.
 * The orchestrator and context manager only ever deal with these types.
 * No provider-specific wire format leaks outside the provider adapters.
 */

// ─── Canonical Message Format ─────────────────────────────────────────────────

export type CanonicalRole = 'user' | 'assistant';

export type CanonicalContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error: boolean;
    };

export interface CanonicalMessage {
  role: CanonicalRole;
  content: CanonicalContentBlock[];
}

// ─── LLM Config ──────────────────────────────────────────────────────────────

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  apiKey: string;
  /** Maximum tokens to generate in a single response */
  maxTokens: number;
  temperature: number;
  /** Estimated total context window (in tokens) of the selected model */
  contextWindow: number;
}

// ─── Streaming Events ─────────────────────────────────────────────────────────

/**
 * Normalized streaming events from any provider.
 * The orchestrator subscribes to these via callbacks.
 */
export type LLMStreamEvent =
  /** A chunk of assistant text */
  | { type: 'text_delta'; text: string }
  /**
   * Tool call started — Anthropic fires this before arguments finish streaming,
   * so we can show "Running: tool_name..." in the UI early.
   */
  | { type: 'tool_start'; id: string; name: string }
  /** Incremental JSON fragment of the tool input (Anthropic only, others emit on tool_complete) */
  | { type: 'tool_delta'; id: string; input_partial: string }
  /** Tool call fully parsed and ready to execute */
  | {
      type: 'tool_complete';
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  /** Real token usage from the provider API — use these for context budget tracking */
  | { type: 'usage'; input_tokens: number; output_tokens: number }
  /** Stream finished */
  | { type: 'done'; stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop' };

// ─── Tool Definition Format (provider-agnostic) ───────────────────────────────

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: string;
      description: string;
      enum?: string[];
      default?: unknown;
    }
  >;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

// ─── LLM Response (accumulated from stream) ──────────────────────────────────

export interface LLMResponse {
  message: CanonicalMessage;
  inputTokens: number;
  outputTokens: number;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop';
}

// ─── Context Usage ────────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Estimated total tokens in current context window */
  contextUsed: number;
  /** Model's total context window limit */
  contextLimit: number;
}
