import type { AgentSession, ChatMessage, ToolExecution } from 'db-schema';
import { ActionQueue } from './queue';

/**
 * Dextro Agent Orchestrator
 * Manages active sessions, routes messages to LLM/agents,
 * and gates tool executions through the approval queue.
 */
export class AgentOrchestrator {
  private sessions: Map<string, AgentSession> = new Map();
  readonly queue: ActionQueue;

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

  requestToolExecution(
    sessionId: string,
    command: string,
    requiresHost: boolean
  ): ToolExecution {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const tool = this.queue.enqueue({ command, requiresHost });
    session.toolQueue.push(tool);
    return tool;
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }
}
