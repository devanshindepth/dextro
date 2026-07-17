import { AGENT_TOOLS } from './tools';
import type { ChatMessage } from 'core-types';

export interface LLMResponse {
  content: string | null;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string; // JSON string
  }>;
}

const SYSTEM_PROMPT = `You are Dextro, an expert AI Agent Orchestrator running natively on a mobile device.
Your goal is to assist the user by reading files, writing code, executing terminal commands, and pushing changes via git.
When proposing file paths or working directories, always use relative paths from the project root.
Think carefully about multi-step tasks. Do not attempt to run tools that are outside your granted capabilities.
If you need to compile or install dependencies, use the 'run_command' tool, which executes in a sandboxed native runtime on the device.
Be concise.`;

export async function callOpenAI(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  toolResponses: Array<{ tool_call_id: string; name: string; content: string }> = []
): Promise<LLMResponse> {
  const url = 'https://api.openai.com/v1/chat/completions';
  
  // Map our internal chat history to OpenAI format
  const formattedMessages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  for (const msg of messages) {
    if (msg.role === 'user' || msg.role === 'agent') {
      formattedMessages.push({
        role: msg.role === 'agent' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
  }

  // Append any tool execution results fed back to the LLM
  for (const toolResult of toolResponses) {
    formattedMessages.push({
      role: 'tool',
      tool_call_id: toolResult.tool_call_id,
      name: toolResult.name,
      content: toolResult.content, // Untrusted input is injected here
    });
  }

  const payload = {
    model,
    messages: formattedMessages,
    tools: AGENT_TOOLS,
    tool_choice: 'auto',
    temperature: 0.2,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0]?.message;

  if (!choice) {
    throw new Error('No choice returned from OpenAI');
  }

  return {
    content: choice.content ?? null,
    toolCalls: choice.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }))
  };
}
