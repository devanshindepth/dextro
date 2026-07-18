/**
 * Dextro Session Store — SQLite Persistence
 *
 * Persists agent sessions, messages, and tool executions across app restarts
 * using expo-sqlite with append-only writes for messages (never full rewrites).
 *
 * Schema v1:
 *   sessions        — session metadata
 *   messages        — chat messages per session
 *   tool_executions — tool queue per session
 *
 * Migrations are versioned via PRAGMA user_version.
 */

import * as SQLite from 'expo-sqlite';
import type { AgentSession, ChatMessage, ToolExecution } from 'core-types';

// ─── Database Setup ───────────────────────────────────────────────────────────

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('dextro.db');
  await runMigrations(db);
  return db;
}

async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  const result = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion < 1) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        settings TEXT NOT NULL,
        total_input_tokens INTEGER DEFAULT 0,
        total_output_tokens INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tool_executions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        command TEXT NOT NULL,
        tool_name TEXT,
        tool_args TEXT,
        status TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'gate',
        approved_at INTEGER,
        started_at INTEGER,
        completed_at INTEGER,
        output TEXT,
        error TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_tools_session ON tool_executions(session_id);

      PRAGMA user_version = 1;
    `);
  }
}

// ─── Session Operations ───────────────────────────────────────────────────────

/** Load all session metadata (without messages — lazy loaded) */
export async function loadAllSessions(): Promise<AgentSession[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{
    id: string;
    name: string;
    created_at: number;
    settings: string;
    total_input_tokens: number;
    total_output_tokens: number;
  }>('SELECT * FROM sessions ORDER BY created_at DESC');

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    settings: JSON.parse(row.settings),
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    messages: [], // Loaded lazily
    toolQueue: [], // Loaded lazily
  }));
}

/** Load messages for a specific session */
export async function loadSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{
    id: string;
    role: string;
    content: string;
    timestamp: number;
  }>(
    'SELECT id, role, content, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
    [sessionId]
  );

  return rows.map((row) => ({
    id: row.id,
    role: row.role as ChatMessage['role'],
    content: row.content,
    timestamp: row.timestamp,
  }));
}

/** Load tool executions for a specific session */
export async function loadSessionTools(sessionId: string): Promise<ToolExecution[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{
    id: string;
    command: string;
    tool_name: string | null;
    tool_args: string | null;
    status: string;
    tier: string;
    approved_at: number | null;
    started_at: number | null;
    completed_at: number | null;
    output: string | null;
    error: string | null;
  }>(
    'SELECT * FROM tool_executions WHERE session_id = ? ORDER BY rowid ASC',
    [sessionId]
  );

  return rows.map((row) => ({
    id: row.id,
    command: row.command,
    toolName: row.tool_name ?? undefined,
    toolArgs: row.tool_args ? JSON.parse(row.tool_args) : undefined,
    status: row.status as ToolExecution['status'],
    tier: (row.tier ?? 'gate') as ToolExecution['tier'],
    approvedAt: row.approved_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    requiresHost: true,
  }));
}

/** Create or update a session record */
export async function saveSession(session: AgentSession): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO sessions (id, name, created_at, settings, total_input_tokens, total_output_tokens)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.name,
      session.createdAt,
      JSON.stringify(session.settings),
      session.totalInputTokens,
      session.totalOutputTokens,
    ]
  );
}

/** Append a single message to storage (never rewrites history) */
export async function appendMessage(sessionId: string, message: ChatMessage): Promise<void> {
  // Don't persist streaming placeholder messages or system utility messages
  if (message.isStreaming) return;

  const database = await getDb();
  await database.runAsync(
    `INSERT OR IGNORE INTO messages (id, session_id, role, content, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [message.id, sessionId, message.role, message.content, message.timestamp]
  );
}

/** Upsert a tool execution record */
export async function upsertToolExecution(sessionId: string, tool: ToolExecution): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO tool_executions
     (id, session_id, command, tool_name, tool_args, status, tier, approved_at, started_at, completed_at, output, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tool.id,
      sessionId,
      tool.command,
      tool.toolName ?? null,
      tool.toolArgs ? JSON.stringify(tool.toolArgs) : null,
      tool.status,
      tool.tier,
      tool.approvedAt ?? null,
      tool.startedAt ?? null,
      tool.completedAt ?? null,
      tool.output ?? null,
      tool.error ?? null,
    ]
  );
}

/** Delete a session and all its messages/tools (cascades via FK) */
export async function deleteSession(sessionId: string): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

/** Update session token counts */
export async function updateSessionTokens(
  sessionId: string,
  totalInput: number,
  totalOutput: number
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'UPDATE sessions SET total_input_tokens = ?, total_output_tokens = ? WHERE id = ?',
    [totalInput, totalOutput, sessionId]
  );
}
