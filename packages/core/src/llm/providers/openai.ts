/**
 * OpenAI provider adapter.
 *
 * Converts canonical messages → OpenAI Chat Completions wire format,
 * and OpenAI SSE stream deltas → canonical LLMStreamEvents.
 *
 * OpenAI-specific behaviors:
 * - Tool results are a separate `role: 'tool'` message
 * - Tool calls arrive as delta.tool_calls[] with index-based accumulation
 * - Token usage in the final [DONE]-adjacent chunk (stream_options.include_usage)
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

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

// ─── Outbound: Canonical → OpenAI ────────────────────────────────────────────

export function toOpenAIMessages(
  systemPrompt: string,
  messages: CanonicalMessage[]
): OpenAIMessage[] {
  const result: OpenAIMessage[] = [{ role: 'system', content: systemPrompt }];

  for (const msg of messages) {
    const textBlocks = msg.content.filter((b): b is Extract<CanonicalContentBlock, { type: 'text' }> => b.type === 'text');
    const toolUseBlocks = msg.content.filter((b): b is Extract<CanonicalContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
    const toolResultBlocks = msg.content.filter((b): b is Extract<CanonicalContentBlock, { type: 'tool_result' }> => b.type === 'tool_result');

    if (msg.role === 'assistant') {
      const assistantMsg: OpenAIMessage = {
        role: 'assistant',
        content: textBlocks.length > 0 ? textBlocks.map(b => b.text).join('') : null,
      };
      if (toolUseBlocks.length > 0) {
        assistantMsg.tool_calls = toolUseBlocks.map((b) => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));
      }
      result.push(assistantMsg);
    } else if (msg.role === 'user') {
      // Tool results become role:'tool' messages, regular content becomes role:'user'
      for (const block of toolResultBlocks) {
        result.push({
          role: 'tool',
          tool_call_id: block.tool_use_id,
          content: block.content,
        });
      }
      if (textBlocks.length > 0) {
        result.push({ role: 'user', content: textBlocks.map(b => b.text).join('') });
      }
    }
  }

  return result;
}

export function toOpenAITools(tools: ToolDefinition[]): object[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// ─── Inbound: OpenAI SSE → LLMStreamEvent ────────────────────────────────────

interface ToolCallDeltaBuffer {
  id: string;
  name: string;
  argumentsJson: string;
}

export function createOpenAIStreamParser() {
  const toolBuffers = new Map<number, ToolCallDeltaBuffer>();
  let finishedToolIndices = new Set<number>();

  return function parseOpenAIChunk(data: string): LLMStreamEvent[] {
    const events: LLMStreamEvent[] = [];
    if (data === '[DONE]') return events;

    try {
      const parsed = JSON.parse(data);
      const choice = parsed.choices?.[0];
      const delta = choice?.delta;

      if (!delta) {
        // Usage chunk (stream_options: include_usage)
        if (parsed.usage) {
          events.push({
            type: 'usage',
            input_tokens: parsed.usage.prompt_tokens ?? 0,
            output_tokens: parsed.usage.completion_tokens ?? 0,
          });
        }
        return events;
      }

      if (delta.content) {
        events.push({ type: 'text_delta', text: delta.content });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx: number = tc.index;

          if (!toolBuffers.has(idx)) {
            // New tool call — fire tool_start
            const buf: ToolCallDeltaBuffer = {
              id: tc.id ?? `openai-tool-${idx}`,
              name: tc.function?.name ?? '',
              argumentsJson: '',
            };
            toolBuffers.set(idx, buf);
            events.push({ type: 'tool_start', id: buf.id, name: buf.name });
          }

          const buf = toolBuffers.get(idx)!;
          if (tc.id) buf.id = tc.id;
          if (tc.function?.name) buf.name = tc.function.name;
          if (tc.function?.arguments) {
            buf.argumentsJson += tc.function.arguments;
            events.push({ type: 'tool_delta', id: buf.id, input_partial: tc.function.arguments });
          }
        }
      }

      const finishReason = choice?.finish_reason;
      if (finishReason) {
        // Flush any pending tool calls
        for (const [idx, buf] of toolBuffers.entries()) {
          if (!finishedToolIndices.has(idx)) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(buf.argumentsJson); } catch (_) {}
            events.push({ type: 'tool_complete', id: buf.id, name: buf.name, input });
            finishedToolIndices.add(idx);
          }
        }

        const reasonMap: Record<string, LLMResponse['stopReason']> = {
          stop: 'stop',
          tool_calls: 'tool_use',
          length: 'max_tokens',
        };
        events.push({
          type: 'done',
          stop_reason: reasonMap[finishReason] ?? 'end_turn',
        });
      }
    } catch (_) {
      // Malformed chunk — skip
    }

    return events;
  };
}

// ─── Main Streaming Function ──────────────────────────────────────────────────

export async function streamOpenAI(
  config: LLMConfig,
  systemPrompt: string,
  messages: CanonicalMessage[],
  tools: ToolDefinition[],
  onEvent: (event: LLMStreamEvent) => void,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const url = 'https://api.openai.com/v1/chat/completions';

  const body = {
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    messages: toOpenAIMessages(systemPrompt, messages),
    tools: toOpenAITools(tools),
    tool_choice: 'auto',
    stream: true,
    stream_options: { include_usage: true },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${errText}`);
  }

  const parseChunk = createOpenAIStreamParser();

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
