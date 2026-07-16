// Dextro db-schema: Shared Automerge document type definitions
// These types flow across mobile client AND laptop daemon via CRDT sync.

export type MessageRole = 'user' | 'agent' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  agentId?: string;
}

export type ToolStatus = 'pending_approval' | 'queued' | 'running' | 'completed' | 'failed';

export interface ToolExecution {
  id: string;
  command: string;
  status: ToolStatus;
  approvedAt?: number;
  startedAt?: number;
  completedAt?: number;
  output?: string;
  error?: string;
  requiresHost: boolean; // true = needs laptop daemon; false = can run locally
}

export interface AgentSession {
  id: string;
  name: string;
  createdAt: number;
  messages: ChatMessage[];
  toolQueue: ToolExecution[];
  projectPath: string; // path to the git repo on device storage
  remoteGitUrl?: string; // GitHub/GitLab relay URL
}

export interface AppState {
  sessions: AgentSession[];
  activeSessionId: string | null;
  llmProvider: 'openai' | 'anthropic' | 'gemini' | 'custom';
  llmModel: string;
  // Note: actual API key stored in SecureStore, NOT in this synced doc
  llmKeyRef: string | null;
  daemonConnected: boolean;
  lastSyncedAt: number;
}
