/**
 * Dextro Tool Executor (Android / Expo)
 *
 * Executes all 17 agent tools locally on the device using:
 * - expo-file-system for all file operations
 * - isomorphic-git (via GitSyncService) for git operations
 * - TermuxBridge for shell command execution
 * - Native fetch() for URL reading
 *
 * All file paths are validated through resolveAndJailPathRN() to prevent
 * directory traversal. The jail root is the shared external storage path
 * so both this executor and Termux see the same files.
 *
 * Each tool returns a string result that becomes the tool_result fed back to the LLM.
 */

import * as FileSystemLegacy from 'expo-file-system/legacy';
import type { ToolExecution } from 'core-types';
import { resolveAndJailPathRN } from 'shared-core';
import { GitSyncService } from '../git/git-sync';
import { applyPatch } from './patch-apply';
import { getTermuxBridge } from './termux-bridge';

const ensureUri = (path: string): string => {
  if (path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  return `file://${path}`;
};

const FileSystem = {
  getInfoAsync: (path: string, options?: any) => FileSystemLegacy.getInfoAsync(ensureUri(path), options),
  readDirectoryAsync: (path: string) => FileSystemLegacy.readDirectoryAsync(ensureUri(path)),
  readAsStringAsync: (path: string, options?: any) => FileSystemLegacy.readAsStringAsync(ensureUri(path), options),
  makeDirectoryAsync: (path: string, options?: any) => FileSystemLegacy.makeDirectoryAsync(ensureUri(path), options),
  writeAsStringAsync: (path: string, content: string, options?: any) => FileSystemLegacy.writeAsStringAsync(ensureUri(path), content, options),
  deleteAsync: (path: string, options?: any) => FileSystemLegacy.deleteAsync(ensureUri(path), options),
  moveAsync: (options: { from: string; to: string }) => FileSystemLegacy.moveAsync({ from: ensureUri(options.from), to: ensureUri(options.to) }),
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecutorCallbacks {
  /** Called with incremental output during run_command */
  onChunk?: (toolId: string, chunk: string) => void;
}

// ─── Path Helpers ─────────────────────────────────────────────────────────────

function jail(projectRoot: string, relativePath: string): string {
  return resolveAndJailPathRN(projectRoot, relativePath);
}

// ─── Individual Tool Implementations ─────────────────────────────────────────

async function executeListDirectory(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const targetPath = jail(projectRoot, String(args.path ?? '.'));

  const info = await FileSystem.getInfoAsync(targetPath);
  if (!info.exists) throw new Error(`Directory not found: ${args.path}`);
  if (!info.isDirectory) throw new Error(`Not a directory: ${args.path}`);

  const entries = await FileSystem.readDirectoryAsync(targetPath);

  // Gather type info for each entry
  const details = await Promise.all(
    entries.map(async (name) => {
      const entryPath = `${targetPath}/${name}`;
      const entryInfo = await FileSystem.getInfoAsync(entryPath, { size: true });
      const type = entryInfo.isDirectory ? 'dir' : 'file';
      const size = !entryInfo.isDirectory ? ` (${(entryInfo as any).size ?? 0} bytes)` : '';
      return `${type === 'dir' ? '📁' : '📄'} ${name}${type === 'dir' ? '/' : ''}${size}`;
    })
  );

  if (details.length === 0) return `Directory is empty: ${args.path}`;
  return `Contents of ${args.path}:\n${details.join('\n')}`;
}

async function executeReadFile(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const targetPath = jail(projectRoot, String(args.path));
  const info = await FileSystem.getInfoAsync(targetPath);
  if (!info.exists) throw new Error(`File not found: ${args.path}`);
  if (info.isDirectory) throw new Error(`Path is a directory, not a file: ${args.path}`);

  const content = await FileSystem.readAsStringAsync(targetPath);
  const lines = content.split('\n');

  const startLine = args.start_line ? Math.max(1, Number(args.start_line)) - 1 : 0;
  const endLine = args.end_line ? Math.min(lines.length, Number(args.end_line)) : lines.length;

  const slice = lines.slice(startLine, endLine);

  // Add line numbers
  const numbered = slice.map((line, idx) => `${startLine + idx + 1}: ${line}`).join('\n');
  const header = `File: ${args.path} (lines ${startLine + 1}–${endLine} of ${lines.length})`;
  return `${header}\n\`\`\`\n${numbered}\n\`\`\``;
}

async function executeSearchFiles(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const searchRoot = jail(projectRoot, String(args.path ?? '.'));
  const patternStr = String(args.pattern ?? '');
  const filePattern = args.file_pattern ? String(args.file_pattern) : null;
  const caseSensitive = String(args.case_sensitive ?? 'false') === 'true';

  const flags = caseSensitive ? 'g' : 'gi';
  let pattern: RegExp;
  try {
    pattern = new RegExp(patternStr, flags);
  } catch (e: unknown) {
    throw new Error(`Invalid regex pattern: ${patternStr}`);
  }

  const results: string[] = [];
  const MAX_RESULTS = 100;

  async function walkDir(dirPath: string): Promise<void> {
    if (results.length >= MAX_RESULTS) return;

    let entries: string[];
    try {
      entries = await FileSystem.readDirectoryAsync(dirPath);
    } catch (_) { return; }

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) return;

      // Skip hidden dirs and node_modules
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;

      const entryPath = `${dirPath}/${entry}`;
      const info = await FileSystem.getInfoAsync(entryPath);

      if (info.isDirectory) {
        await walkDir(entryPath);
      } else {
        // File extension filter
        if (filePattern) {
          const ext = filePattern.replace('*', '');
          if (!entry.endsWith(ext)) continue;
        }

        try {
          const content = await FileSystem.readAsStringAsync(entryPath);
          const lines = content.split('\n');
          const relPath = entryPath.replace(projectRoot + '/', '');

          for (let i = 0; i < lines.length; i++) {
            if (results.length >= MAX_RESULTS) return;
            pattern.lastIndex = 0;
            if (pattern.test(lines[i])) {
              results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch (_) {}
      }
    }
  }

  await walkDir(searchRoot);

  if (results.length === 0) return `No matches found for pattern: ${patternStr}`;
  const header = results.length >= MAX_RESULTS
    ? `Results (showing first ${MAX_RESULTS}, limit reached):`
    : `Results (${results.length} matches):`;
  return `${header}\n${results.join('\n')}`;
}

async function executeFindSymbol(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const symbol = String(args.symbol ?? '');
  const searchPath = String(args.path ?? '.');

  // Patterns for different declaration styles
  const patterns = [
    `function ${symbol}[\\s\\(]`,
    `async function ${symbol}[\\s\\(]`,
    `const ${symbol}\\s*=`,
    `let ${symbol}\\s*=`,
    `var ${symbol}\\s*=`,
    `class ${symbol}[\\s{<]`,
    `interface ${symbol}[\\s{<]`,
    `type ${symbol}\\s*=`,
    `enum ${symbol}\\s*{`,
    `def ${symbol}[\\s\\(]`,          // Python
    `fn ${symbol}[\\s\\(]`,           // Rust
    `func ${symbol}[\\s\\(]`,         // Go/Swift
    `export.*${symbol}`,
  ].join('|');

  return executeSearchFiles(projectRoot, {
    pattern: patterns,
    path: searchPath,
    case_sensitive: 'true',
  });
}

async function executeWriteFile(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const targetPath = jail(projectRoot, String(args.path));
  const content = String(args.content ?? '');

  // Ensure parent directory exists
  const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'));
  if (parentDir) {
    await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true }).catch(() => {});
  }

  await FileSystem.writeAsStringAsync(targetPath, content);
  const lines = content.split('\n').length;
  return `Successfully wrote ${lines} lines to ${args.path}`;
}

async function executePatchFile(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const targetPath = jail(projectRoot, String(args.path));
  const diff = String(args.diff ?? '');

  const info = await FileSystem.getInfoAsync(targetPath);
  if (!info.exists) throw new Error(`File not found: ${args.path}. Use write_file to create new files.`);

  const currentContent = await FileSystem.readAsStringAsync(targetPath);
  const result = applyPatch(currentContent, diff);

  if (!result.applied) {
    throw new Error(result.reason ?? 'Patch application failed');
  }

  await FileSystem.writeAsStringAsync(targetPath, result.newContent!);
  return `Successfully patched ${args.path}\n\nChanges applied:\n${result.displayDiff}`;
}

async function executeCreateDirectory(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const targetPath = jail(projectRoot, String(args.path));
  await FileSystem.makeDirectoryAsync(targetPath, { intermediates: true });
  return `Created directory: ${args.path}`;
}

async function executeDeleteFile(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const targetPath = jail(projectRoot, String(args.path));
  const info = await FileSystem.getInfoAsync(targetPath);
  if (!info.exists) return `File not found (already deleted?): ${args.path}`;

  await FileSystem.deleteAsync(targetPath, { idempotent: true });
  return `Deleted: ${args.path}`;
}

async function executeMoveFile(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const fromPath = jail(projectRoot, String(args.from));
  const toPath = jail(projectRoot, String(args.to));

  const info = await FileSystem.getInfoAsync(fromPath);
  if (!info.exists) throw new Error(`Source not found: ${args.from}`);

  // Ensure destination parent exists
  const toParent = toPath.substring(0, toPath.lastIndexOf('/'));
  if (toParent) {
    await FileSystem.makeDirectoryAsync(toParent, { intermediates: true }).catch(() => {});
  }

  await FileSystem.moveAsync({ from: fromPath, to: toPath });
  return `Moved: ${args.from} → ${args.to}`;
}

async function executeGitStatus(projectRoot: string): Promise<string> {
  const status = await GitSyncService.status(projectRoot);
  if (status.length === 0) return 'Working tree clean — no changes.';

  const lines = status.map((s: { path: string; status: string }) => {
    const icon =
      s.status === 'modified' ? 'M' :
      s.status === 'added' ? 'A' :
      s.status === 'deleted' ? 'D' :
      s.status === 'untracked' ? '?' : s.status;
    return ` ${icon}  ${s.path}`;
  });

  return `On branch ${await GitSyncService.currentBranch(projectRoot)}\n\nChanges:\n${lines.join('\n')}`;
}

async function executeGitDiff(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const filepath = args.path ? String(args.path) : undefined;
  const diff = await GitSyncService.diff(projectRoot, filepath);
  if (!diff || diff.trim() === '') return 'No uncommitted changes.';
  return `\`\`\`diff\n${diff}\n\`\`\``;
}

async function executeGitLog(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const limit = Math.min(50, Number(args.limit ?? 20));
  const commits = await GitSyncService.log(projectRoot, limit);

  if (commits.length === 0) return 'No commits yet.';

  const lines = commits.map((c: { oid: string; message: string; author: string; timestamp: number }) => {
    const date = new Date(c.timestamp * 1000).toISOString().slice(0, 10);
    const shortOid = c.oid.slice(0, 7);
    return `${shortOid} ${date} ${c.author}: ${c.message.split('\n')[0]}`;
  });

  return `Recent commits (${commits.length}):\n${lines.join('\n')}`;
}

async function executeGitBranch(projectRoot: string): Promise<string> {
  const { branches, current } = await GitSyncService.listBranches(projectRoot);
  const lines = branches.map((b: string) => `${b === current ? '* ' : '  '}${b}`);
  return `Branches:\n${lines.join('\n')}`;
}

async function executeGitCommit(projectRoot: string, args: Record<string, unknown>, token?: string): Promise<string> {
  const message = String(args.message ?? 'Agent commit');
  const sha = await GitSyncService.commit(projectRoot, message);
  return `Created commit ${sha.slice(0, 7)}: "${message}"`;
}

async function executeGitCheckout(projectRoot: string, args: Record<string, unknown>): Promise<string> {
  const branch = String(args.branch);
  const create = String(args.create ?? 'false') === 'true';
  const file = args.file ? String(args.file) : undefined;

  if (file) {
    const filePath = jail(projectRoot, file);
    await GitSyncService.checkoutFile(projectRoot, file);
    return `Restored ${file} to last committed state`;
  }

  await GitSyncService.checkout(projectRoot, branch, create);
  return create ? `Created and switched to branch: ${branch}` : `Switched to branch: ${branch}`;
}

async function executeGitPush(projectRoot: string, args: Record<string, unknown>, token?: string): Promise<string> {
  if (!token) throw new Error('No GitHub token configured. Add one in Settings → General.');
  const remote = String(args.remote ?? 'origin');
  await GitSyncService.push(projectRoot, token, remote);
  return `Pushed to ${remote}`;
}

async function executeRunCommand(
  projectRoot: string,
  args: Record<string, unknown>,
  toolId: string,
  callbacks?: ExecutorCallbacks,
  signal?: AbortSignal
): Promise<string> {
  const command = String(args.command ?? '');
  const cwdRelative = String(args.cwd ?? '.');
  const timeoutSeconds = Math.min(300, Number(args.timeout_seconds ?? 60));

  // Build absolute CWD within shared storage
  const absoluteCwd = resolveAndJailPathRN(projectRoot, cwdRelative);

  const bridge = getTermuxBridge();

  // Check availability on first use
  const available = await bridge.isAvailable();
  if (!available) {
    throw new Error(`Termux is not available.\n\n${bridge.getSetupInstructions()}`);
  }

  const result = await bridge.execute(
    command,
    absoluteCwd,
    (chunk) => {
      callbacks?.onChunk?.(toolId, chunk);
    },
    signal,
    timeoutSeconds * 1000
  );

  if (result.timedOut) {
    return `Command timed out after ${timeoutSeconds}s.\n\nPartial output:\n${result.output}`;
  }

  const exitLabel = result.exitCode === 0 ? '✓ Exit 0' : `✗ Exit ${result.exitCode}`;
  return `${exitLabel}\n\n${result.output}`;
}

async function executeReadUrl(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '');
  const description = String(args.description ?? '');

  if (!url.startsWith('https://')) {
    throw new Error('Only https:// URLs are allowed for security.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let responseText: string;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Dextro-Agent/1.0' },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    responseText = await response.text();
  } finally {
    clearTimeout(timeout);
  }

  // Strip HTML tags
  const stripped = responseText
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const MAX_CHARS = 16000;
  const truncated = stripped.length > MAX_CHARS
    ? stripped.slice(0, MAX_CHARS) + `\n\n[truncated — ${stripped.length - MAX_CHARS} additional characters omitted]`
    : stripped;

  return `URL: ${url}\nDescription: ${description}\n\nContent:\n${truncated}`;
}

// ─── Main Executor ────────────────────────────────────────────────────────────

/**
 * Execute a tool and return its string output.
 * Throws on failure — the orchestrator handles error injection into context.
 */
export async function executeToolLocally(
  tool: ToolExecution,
  projectRoot: string,
  githubToken?: string,
  callbacks?: ExecutorCallbacks,
  signal?: AbortSignal
): Promise<string> {
  const { toolName, toolArgs = {} } = tool;

  try {
    switch (toolName) {
      case 'list_directory':
        return await executeListDirectory(projectRoot, toolArgs);

      case 'read_file':
        return await executeReadFile(projectRoot, toolArgs);

      case 'search_files':
        return await executeSearchFiles(projectRoot, toolArgs);

      case 'find_symbol':
        return await executeFindSymbol(projectRoot, toolArgs);

      case 'write_file':
        return await executeWriteFile(projectRoot, toolArgs);

      case 'patch_file':
        return await executePatchFile(projectRoot, toolArgs);

      case 'create_directory':
        return await executeCreateDirectory(projectRoot, toolArgs);

      case 'delete_file':
        return await executeDeleteFile(projectRoot, toolArgs);

      case 'move_file':
        return await executeMoveFile(projectRoot, toolArgs);

      case 'git_status':
        return await executeGitStatus(projectRoot);

      case 'git_diff':
        return await executeGitDiff(projectRoot, toolArgs);

      case 'git_log':
        return await executeGitLog(projectRoot, toolArgs);

      case 'git_branch':
        return await executeGitBranch(projectRoot);

      case 'git_commit':
        return await executeGitCommit(projectRoot, toolArgs, githubToken);

      case 'git_checkout':
        return await executeGitCheckout(projectRoot, toolArgs);

      case 'git_push':
        return await executeGitPush(projectRoot, toolArgs, githubToken);

      case 'run_command':
        return await executeRunCommand(projectRoot, toolArgs, tool.id, callbacks, signal);

      case 'read_url':
        return await executeReadUrl(toolArgs);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(msg);
  }
}
