// Dextro core-types: Shared types and interfaces
// These types represent the state of the app natively on device.

// ─── LLM Provider Types ───────────────────────────────────────────────────────

export type LLMProvider = 'openai' | 'anthropic' | 'gemini';

// ─── Security Model ───────────────────────────────────────────────────────────

/**
 * Trust tier for every agent tool.
 * - auto:    Always executes silently (read-only, reversible)
 * - confirm: Requires one user tap (write ops). In 'standard' preset: auto-approved.
 * - gate:    Always requires explicit tap (shell, push, url fetch). Never auto-approved.
 */
export type SecurityTier = 'auto' | 'confirm' | 'gate';

/**
 * User-configurable security preset per project.
 * - safe:     Only auto-approves 'auto' tier tools.
 * - standard: Auto-approves 'auto' and 'confirm' tiers; 'gate' still requires tap.
 * Note: No preset auto-approves 'gate' tools. run_command and git_push always need a tap.
 */
export type SecurityPreset = 'safe' | 'standard';

// ─── Session Settings ─────────────────────────────────────────────────────────

export interface SessionSettings {
  provider: LLMProvider;
  model: string;
  securityPreset: SecurityPreset;
  /** Always a shared external storage path: /storage/emulated/0/Dextro/projects/<name>/ */
  projectPath: string;
  remoteGitUrl?: string;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'agent' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  /** Set when message is still being streamed */
  isStreaming?: boolean;
  agentId?: string;
}

// ─── Tool Execution ───────────────────────────────────────────────────────────

export type ToolStatus =
  | 'pending_approval'
  | 'running'
  | 'completed'
  | 'failed';

export interface ToolExecution {
  id: string;
  /** Display string, e.g. "write_file(src/index.ts)" */
  command: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  status: ToolStatus;
  tier: SecurityTier;
  approvedAt?: number;
  startedAt?: number;
  completedAt?: number;
  output?: string;
  /** Accumulated live output while status === 'running' */
  streamingOutput?: string;
  error?: string;
  /** Estimated token cost of the tool output when fed back to LLM */
  tokensCost?: number;
}

// ─── Agent Session ────────────────────────────────────────────────────────────

export interface AgentSession {
  id: string;
  name: string;
  createdAt: number;
  messages: ChatMessage[];
  toolQueue: ToolExecution[];
  settings: SessionSettings;
  /** Running total of real input tokens from provider API responses */
  totalInputTokens: number;
  /** Running total of real output tokens from provider API responses */
  totalOutputTokens: number;
}

// ─── App State ────────────────────────────────────────────────────────────────

export interface AppState {
  sessions: AgentSession[];
  activeSessionId: string | null;
  daemonConnected: boolean;
  lastSyncedAt: number;
}

// ─── Setup / Onboarding ───────────────────────────────────────────────────────

export interface SetupStatus {
  sharedStoragePermission: 'granted' | 'denied' | 'unknown';
  setupComplete: boolean;
}

// ─── LLM Canonical Types ─────────────────────────────────────────────────────
// Re-exported so callers only need to import from 'core-types'

export * from './llm-types';
