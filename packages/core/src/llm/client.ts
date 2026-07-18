/**
 * Dextro LLM Router
 *
 * Unified entry point for all LLM providers. Selects the correct provider adapter
 * based on config.provider, handles retries with exponential backoff, and presents
 * a single streaming interface to the orchestrator.
 *
 * The orchestrator never imports from providers directly — all provider details
 * are encapsulated here.
 */

import type {
  CanonicalMessage,
  LLMStreamEvent,
  LLMConfig,
  LLMResponse,
  ToolDefinition,
} from 'core-types';
import { streamAnthropic } from './providers/anthropic';
import { streamOpenAI } from './providers/openai';
import { streamGemini } from './providers/gemini';

// ─── Model Metadata ───────────────────────────────────────────────────────────

export interface ModelInfo {
  id: string;
  label: string;
  provider: 'anthropic' | 'openai' | 'gemini';
  contextWindow: number;
  badge?: string;
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'anthropic', contextWindow: 200000 },
  { id: 'claude-haiku-3-5', label: 'Claude Haiku 3.5', provider: 'anthropic', contextWindow: 200000, badge: 'FAST' },
  { id: 'claude-opus-4', label: 'Claude Opus 4', provider: 'anthropic', contextWindow: 200000, badge: 'POWERFUL' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', contextWindow: 128000 },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, badge: 'FAST' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini', contextWindow: 1000000, badge: 'HIGH' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini', contextWindow: 1000000, badge: 'FAST' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'gemini', contextWindow: 1000000 },
];

export function getModelInfo(modelId: string): ModelInfo | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === modelId);
}

export function inferProvider(modelId: string): 'anthropic' | 'openai' | 'gemini' {
  return getModelInfo(modelId)?.provider ?? 'anthropic';
}

// ─── System Prompt ────────────────────────────────────────────────────────────

export const DEXTRO_SYSTEM_PROMPT = `You are Dextro, an expert AI coding agent running natively on an Android mobile device.

Your capabilities:
- Read, write, search, and patch files in the user's project
- Execute shell commands via Termux (run_command)
- Manage git repositories: status, diff, commit, push, branch operations
- Fetch web content for documentation and reference

Your project files are stored in shared external storage at /storage/emulated/0/Dextro/projects/<project-name>/.
Always use paths relative to the project root when referencing files.

Behavioral guidelines:
1. ALWAYS read relevant files before modifying them. Never guess at existing content.
2. For file edits, prefer patch_file over write_file to avoid overwriting unchanged code.
3. When using patch_file, ensure your SEARCH block matches the file exactly — re-read first if unsure.
4. After write_file or patch_file, verify by reading the file back if the change is complex.
5. Think step-by-step for multi-file changes. Read first, plan, then execute.
6. For run_command, always specify cwd relative to the project root.
7. Never run rm -rf or destructive commands. Use delete_file for individual files.
8. Be concise in your text responses — let tool results speak for themselves.
9. When you encounter an error, analyze it carefully and retry with a corrected approach.
10. Wrap all tool output interpretation and analysis in your text response, not in additional tool calls.`;

// ─── Retry Logic ──────────────────────────────────────────────────────────────

const RETRYABLE_STATUS_CODES = new Set([429, 503, 502, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Only retry on network errors or specific HTTP status codes
      const isRetryable =
        lastError.message.includes('fetch') ||
        RETRYABLE_STATUS_CODES.has(
          parseInt(lastError.message.match(/(\d{3}):/)?.[1] ?? '0')
        );

      if (!isRetryable || attempt === retries) break;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[LLMRouter] Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('LLM call failed after retries');
}

// ─── Main Router ──────────────────────────────────────────────────────────────

/**
 * Stream an LLM response using the configured provider.
 * All streaming events are forwarded to onEvent in real-time.
 * Returns the complete response after the stream finishes.
 */
export async function streamLLM(
  config: LLMConfig,
  systemPrompt: string,
  messages: CanonicalMessage[],
  tools: ToolDefinition[],
  onEvent: (event: LLMStreamEvent) => void,
  signal?: AbortSignal
): Promise<LLMResponse> {
  return withRetry(() => {
    switch (config.provider) {
      case 'anthropic':
        return streamAnthropic(config, systemPrompt, messages, tools, onEvent, signal);
      case 'openai':
        return streamOpenAI(config, systemPrompt, messages, tools, onEvent, signal);
      case 'gemini':
        return streamGemini(config, systemPrompt, messages, tools, onEvent, signal);
      default:
        throw new Error(`Unknown provider: ${(config as LLMConfig).provider}`);
    }
  });
}

/**
 * Test connectivity to an LLM provider with a minimal request.
 * Returns 'ok' or an error message.
 */
export async function testConnection(
  provider: 'anthropic' | 'openai' | 'gemini',
  apiKey: string
): Promise<{ ok: boolean; error?: string }> {
  const minimalConfig: LLMConfig = {
    provider,
    model:
      provider === 'anthropic'
        ? 'claude-haiku-3-5'
        : provider === 'openai'
        ? 'gpt-4o-mini'
        : 'gemini-2.0-flash',
    apiKey,
    maxTokens: 10,
    temperature: 0,
    contextWindow: 128000,
  };

  const testMessages: CanonicalMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'Say "ok"' }] },
  ];

  try {
    await streamLLM(minimalConfig, 'You are a test assistant.', testMessages, [], () => {});
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
