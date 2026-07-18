/**
 * Anthropic Claude provider adapter.
 *
 * Converts canonical messages → Anthropic Messages API wire format,
 * and Anthropic SSE stream events → canonical LLMStreamEvents.
 *
 * Key Anthropic-specific behaviors handled here:
 * - Tool use uses content blocks (type: 'tool_use' / 'tool_result')
 * - Tool inputs stream as incremental JSON via 'input_json_delta' events
 *   → we fire tool_start before arguments are complete (enables early UI indicator)
 * - Token usage comes from 'message_delta' event at end of stream
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

interface AnthropicTextBlock { type: 'text'; text: string; }
interface AnthropicToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; }
interface AnthropicToolResultBlock { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean; }

type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicBlock[];
}

// ─── Outbound: Canonical → Anthropic ─────────────────────────────────────────

export function toAnthropicMessages(messages: CanonicalMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    const blocks: AnthropicBlock[] = [];

    for (const block of msg.content) {
      if (block.type === 'text') {
        blocks.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
      } else if (block.type === 'tool_result') {
        blocks.push({
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: block.content,
          is_error: block.is_error,
        });
      }
    }

    // Merge consecutive tool_result blocks into a single user message
    const last = result[result.length - 1];
    if (msg.role === 'user' && last?.role === 'user') {
      last.content.push(...blocks);
    } else {
      result.push({ role: msg.role, content: blocks });
    }
  }

  return result;
}

export function toAnthropicTools(tools: ToolDefinition[]): object[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

// ─── Inbound: Anthropic SSE → LLMStreamEvent ──────────────────────────────────

interface ToolInputBuffer {
  id: string;
  name: string;
  inputJson: string;
}

export function createAnthropicStreamParser() {
  const toolBuffers = new Map<number, ToolInputBuffer>();

  return function parseAnthropicEvent(
    eventType: string,
    data: string
  ): LLMStreamEvent[] {
    const events: LLMStreamEvent[] = [];

    try {
      const parsed = JSON.parse(data);

      switch (eventType) {
        case 'content_block_start': {
          const block = parsed.content_block;
          if (block?.type === 'tool_use') {
            const buf: ToolInputBuffer = { id: block.id, name: block.name, inputJson: '' };
            toolBuffers.set(parsed.index, buf);
            // Fire tool_start immediately — UI can show "Running: name..." before args arrive
            events.push({ type: 'tool_start', id: block.id, name: block.name });
          }
          break;
        }

        case 'content_block_delta': {
          const delta = parsed.delta;
          if (delta?.type === 'text_delta') {
            events.push({ type: 'text_delta', text: delta.text });
          } else if (delta?.type === 'input_json_delta') {
            const buf = toolBuffers.get(parsed.index);
            if (buf) {
              buf.inputJson += delta.partial_json;
              events.push({
                type: 'tool_delta',
                id: buf.id,
                input_partial: delta.partial_json,
              });
            }
          }
          break;
        }

        case 'content_block_stop': {
          const buf = toolBuffers.get(parsed.index);
          if (buf) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(buf.inputJson); } catch (_) {}
            events.push({
              type: 'tool_complete',
              id: buf.id,
              name: buf.name,
              input,
            });
            toolBuffers.delete(parsed.index);
          }
          break;
        }

        case 'message_delta': {
          if (parsed.usage) {
            events.push({
              type: 'usage',
              input_tokens: parsed.usage.input_tokens ?? 0,
              output_tokens: parsed.usage.output_tokens ?? 0,
            });
          }
          if (parsed.delta?.stop_reason) {
            const rawReason = String(parsed.delta.stop_reason);
            const stopReason = (['end_turn', 'tool_use', 'max_tokens', 'stop'].includes(rawReason)
              ? rawReason
              : 'end_turn') as 'end_turn' | 'tool_use' | 'max_tokens' | 'stop';
            events.push({ type: 'done', stop_reason: stopReason });
          }
          break;
        }

        case 'message_start': {
          if (parsed.message?.usage) {
            events.push({
              type: 'usage',
              input_tokens: parsed.message.usage.input_tokens ?? 0,
              output_tokens: parsed.message.usage.output_tokens ?? 0,
            });
          }
          break;
        }
      }
    } catch (_) {
      // Malformed SSE data — skip silently
    }

    return events;
  };
}

// ─── Main Streaming Function ──────────────────────────────────────────────────

export async function streamAnthropic(
  config: LLMConfig,
  systemPrompt: string,
  messages: CanonicalMessage[],
  tools: ToolDefinition[],
  onEvent: (event: LLMStreamEvent) => void,
  signal?: AbortSignal
): Promise<LLMResponse> {
  const url = 'https://api.anthropic.com/v1/messages';

  const body = {
    model: config.model,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    system: systemPrompt,
    messages: toAnthropicMessages(messages),
    tools: toAnthropicTools(tools),
    stream: true,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText}`);
  }

  const parseEvent = createAnthropicStreamParser();

  // Accumulated response for history
  let textContent = '';
  const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: LLMResponse['stopReason'] = 'end_turn';

  // SSE parsing
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEventType = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        const events = parseEvent(currentEventType, data);
        for (const event of events) {
          onEvent(event);

          if (event.type === 'text_delta') textContent += event.text;
          if (event.type === 'tool_complete') toolCalls.push({ id: event.id, name: event.name, input: event.input });
          if (event.type === 'usage') {
            inputTokens = Math.max(inputTokens, event.input_tokens);
            outputTokens += event.output_tokens;
          }
          if (event.type === 'done') stopReason = event.stop_reason;
        }
      }
    }
  }

  // Build canonical response message
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
