/**
 * Google Gemini provider adapter.
 *
 * Converts canonical messages → Gemini GenerateContent wire format,
 * and Gemini SSE stream chunks → canonical LLMStreamEvents.
 *
 * Gemini-specific behaviors:
 * - Tools are `tools[].functionDeclarations[]`
 * - Messages are `contents[]` with `parts[]`
 * - Roles: 'user' | 'model' (no 'assistant')
 * - Tool calls come back as `functionCall` parts; results as `functionResponse` parts
 * - Streaming via `streamGenerateContent` endpoint
 * - Token usage in `usageMetadata` of each chunk
 */

import type {
  CanonicalMessage,
  CanonicalContentBlock,
  LLMStreamEvent,
  LLMConfig,
  LLMResponse,
  ToolDefinition,
} from 'core-types';

// ─── Wire Format Types ────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { content: string } };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// ─── Outbound: Canonical → Gemini ────────────────────────────────────────────

export function toGeminiContents(messages: CanonicalMessage[]): GeminiContent[] {
  const result: GeminiContent[] = [];

  for (const msg of messages) {
    const parts: GeminiPart[] = [];
    const role = msg.role === 'assistant' ? 'model' : 'user';

    for (const block of msg.content) {
      if (block.type === 'text') {
        parts.push({ text: block.text });
      } else if (block.type === 'tool_use') {
        parts.push({ functionCall: { name: block.name, args: block.input } });
      } else if (block.type === 'tool_result') {
        parts.push({
          functionResponse: {
            name: block.tool_use_id, // Gemini uses name, we use tool_use_id as proxy
            response: { content: block.content },
          },
        });
      }
    }

    if (parts.length > 0) {
      // Gemini requires alternating user/model. Merge consecutive same-role messages.
      const last = result[result.length - 1];
      if (last && last.role === role) {
        last.parts.push(...parts);
      } else {
        result.push({ role, parts });
      }
    }
  }

  return result;
}

export function toGeminiTools(tools: ToolDefinition[]): object[] {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

// ─── Inbound: Gemini SSE → LLMStreamEvent ────────────────────────────────────

export function createGeminiStreamParser() {
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;

  return function parseGeminiChunk(data: string): LLMStreamEvent[] {
    const events: LLMStreamEvent[] = [];

    try {
      const parsed = JSON.parse(data);
      const candidates = parsed.candidates ?? [];

      for (const candidate of candidates) {
        const parts: GeminiPart[] = candidate?.content?.parts ?? [];

        for (const part of parts) {
          if (part.text) {
            events.push({ type: 'text_delta', text: part.text });
          }
          if (part.functionCall) {
            const id = `gemini-${part.functionCall.name}-${Date.now()}`;
            events.push({ type: 'tool_start', id, name: part.functionCall.name });
            events.push({
              type: 'tool_complete',
              id,
              name: part.functionCall.name,
              input: part.functionCall.args,
            });
          }
        }

        const finishReason = candidate?.finishReason;
        if (finishReason && finishReason !== 'FINISH_REASON_UNSPECIFIED') {
          const reasonMap: Record<string, LLMResponse['stopReason']> = {
            STOP: 'end_turn',
            MAX_TOKENS: 'max_tokens',
            SAFETY: 'stop',
          };
          events.push({
            type: 'done',
            stop_reason: reasonMap[finishReason] ?? 'end_turn',
          });
        }
      }

      // Usage metadata in each chunk
      const usage = parsed.usageMetadata;
      if (usage) {
        inputTokensTotal = Math.max(inputTokensTotal, usage.promptTokenCount ?? 0);
        outputTokensTotal = usage.candidatesTokenCount ?? 0;
        events.push({
          type: 'usage',
          input_tokens: inputTokensTotal,
          output_tokens: outputTokensTotal,
        });
      }
    } catch (_) {
      // Malformed chunk
    }

    return events;
  };
}

// ─── Main Streaming Function ──────────────────────────────────────────────────

const GEMINI_MODEL_MAP: Record<string, string> = {
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash': 'gemini-2.0-flash',
  'gemini-1.5-pro': 'gemini-1.5-pro',
};

export async function streamGemini(
  config: LLMConfig,
  systemPrompt: string,
  messages: CanonicalMessage[],
  tools: ToolDefinition[],
  onEvent: (event: LLMStreamEvent) => void,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const modelId = GEMINI_MODEL_MAP[config.model] ?? config.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: toGeminiContents(messages),
    tools: toGeminiTools(tools),
    generationConfig: {
      maxOutputTokens: config.maxTokens,
      temperature: config.temperature,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errText}`);
  }

  const parseChunk = createGeminiStreamParser();

  let textContent = '';
  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: LLMResponse['stopReason'] = 'end_turn';

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();

      const events = parseChunk(data);
      for (const event of events) {
        onEvent(event);

        if (event.type === 'text_delta') textContent += event.text;
        if (event.type === 'tool_complete') toolCalls.push({ id: event.id, name: event.name, input: event.input });
        if (event.type === 'usage') { inputTokens = event.input_tokens; outputTokens = event.output_tokens; }
        if (event.type === 'done') stopReason = event.stop_reason;
      }
    }
  }

  const contentBlocks: CanonicalContentBlock[] = [];
  if (textContent) contentBlocks.push({ type: 'text', text: textContent });
  for (const tc of toolCalls) {
    contentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
  }

  return {
    message: { role: 'assistant', content: contentBlocks },
    inputTokens,
    outputTokens,
    stopReason,
  };
}
