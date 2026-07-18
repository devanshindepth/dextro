import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import * as FileSystem from 'expo-file-system/legacy';
import { expoFsAdapter } from './expo-fs-adapter';

const REPOS_ROOT = `${FileSystem.documentDirectory}repos/`;
const GIT_AUTHOR = { name: 'Dextro Agent', email: 'agent@dextro.local' };

const ensureUri = (path: string): string => {
  if (path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  return `file://${path}`;
};

/**
 * Dextro Git Sync Service
 *
 * Complete git operations via isomorphic-git with the expo-file-system adapter.
 *
 * Note on project paths:
 * - For purely local operations, files live at the Expo document directory path
 * - For Termux interop, the shared storage path is used for the working tree
 * - These can be the same repo if cloned/initialized at the shared storage path
 */
export const GitSyncService = {
  /** Initialize a new local git repo */
  async init(repoName: string): Promise<string> {
    const dir = `${REPOS_ROOT}${repoName}`;
    await FileSystem.makeDirectoryAsync(ensureUri(dir), { intermediates: true });
    await git.init({ fs: expoFsAdapter, dir });
    console.log(`[GitSync] Initialized repo at ${dir}`);
    return dir;
  },

  /** Clone a remote repo into local device storage */
  async clone(remoteUrl: string, repoName: string, token: string): Promise<string> {
    const dir = `${REPOS_ROOT}${repoName}`;
    await FileSystem.makeDirectoryAsync(ensureUri(dir), { intermediates: true });
    await git.clone({
      fs: expoFsAdapter,
      http,
      dir,
      url: remoteUrl,
      depth: 1,
      onAuth: () => ({ username: token, password: 'x-oauth-basic' }),
    });
    console.log(`[GitSync] Cloned ${remoteUrl} → ${dir}`);
    return dir;
  },

  /** Get the current branch name */
  async currentBranch(dir: string): Promise<string> {
    try {
      const branch = await git.currentBranch({ fs: expoFsAdapter, dir });
      return branch ?? 'HEAD';
    } catch (_) {
      return 'HEAD';
    }
  },

  /** List all local branches and the current branch */
  async listBranches(dir: string): Promise<{ branches: string[]; current: string }> {
    const [branches, current] = await Promise.all([
      git.listBranches({ fs: expoFsAdapter, dir }),
      GitSyncService.currentBranch(dir),
    ]);
    return { branches, current };
  },

  /**
   * Get working tree status.
   * Returns an array of { path, status } objects.
   * Status values: 'modified', 'added', 'deleted', 'untracked', 'unchanged'
   */
  async status(dir: string): Promise<Array<{ path: string; status: string }>> {
    const matrix = await git.statusMatrix({ fs: expoFsAdapter, dir });

    return matrix
      .filter(([_path, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1))
      .map(([filePath, head, workdir, stage]) => {
        let status: string;
        if (head === 0 && workdir === 2) status = 'untracked';
        else if (head === 0 && workdir === 2 && stage === 2) status = 'added';
        else if (head === 1 && workdir === 2) status = 'modified';
        else if (head === 1 && workdir === 0) status = 'deleted';
        else if (head === 1 && workdir === 2 && stage === 0) status = 'modified';
        else status = 'modified';
        return { path: String(filePath), status };
      });
  },

  /**
   * Get the unified diff of uncommitted changes.
   * Optionally scoped to a specific file.
   */
  async diff(dir: string, filepath?: string): Promise<string> {
    const statusMatrix = await git.statusMatrix({ fs: expoFsAdapter, dir, filepaths: filepath ? [filepath] : undefined });
    const changedFiles = statusMatrix.filter(
      ([_, head, workdir]) => head !== workdir
    );

    if (changedFiles.length === 0) return '';

    const diffs: string[] = [];

    for (const [filePath] of changedFiles) {
      try {
        const absPath = `${dir}/${filePath}`;
        const info = await FileSystem.getInfoAsync(absPath);

        // Try to get committed version
        let oldContent = '';
        try {
          const { blob } = await git.readBlob({
            fs: expoFsAdapter,
            dir,
            oid: await git.resolveRef({ fs: expoFsAdapter, dir, ref: 'HEAD' }).catch(() => ''),
            filepath: String(filePath),
          });
          oldContent = new TextDecoder().decode(blob);
        } catch (_) {
          oldContent = ''; // New file
        }

        const newContent = info.exists && !info.isDirectory
          ? await FileSystem.readAsStringAsync(absPath)
          : '';

        if (oldContent !== newContent) {
          const oldLines = oldContent.split('\n');
          const newLines = newContent.split('\n');
          diffs.push(`--- a/${filePath}\n+++ b/${filePath}`);
          // Simple unified diff (line-by-line)
          diffs.push(simpleDiff(oldLines, newLines));
        }
      } catch (_) {}
    }

    return diffs.join('\n\n');
  },

  /** Get commit history */
  async log(dir: string, limit = 20): Promise<Array<{
    oid: string;
    message: string;
    author: string;
    timestamp: number;
  }>> {
    try {
      const commits = await git.log({ fs: expoFsAdapter, dir, depth: limit });
      return commits.map((c) => ({
        oid: c.oid,
        message: c.commit.message.trim(),
        author: c.commit.author.name,
        timestamp: c.commit.author.timestamp,
      }));
    } catch (_) {
      return [];
    }
  },

  /** Stage a specific file */
  async stage(dir: string, filepath: string): Promise<void> {
    await git.add({ fs: expoFsAdapter, dir, filepath });
  },

  /** Stage all changes and create a commit */
  async commit(dir: string, message: string): Promise<string> {
    await git.add({ fs: expoFsAdapter, dir, filepath: '.' });
    const sha = await git.commit({
      fs: expoFsAdapter,
      dir,
      message,
      author: GIT_AUTHOR,
    });
    console.log(`[GitSync] Committed ${sha.slice(0, 7)}: "${message}"`);
    return sha;
  },

  /** Push commits to remote */
  async push(dir: string, token: string, remote = 'origin'): Promise<void> {
    await git.push({
      fs: expoFsAdapter,
      http,
      dir,
      remote,
      onAuth: () => ({ username: token, password: 'x-oauth-basic' }),
    });
    console.log(`[GitSync] Pushed to ${remote}`);
  },

  /** Pull latest changes from remote */
  async pull(dir: string, token: string, remote = 'origin'): Promise<void> {
    await git.pull({
      fs: expoFsAdapter,
      http,
      dir,
      remote,
      onAuth: () => ({ username: token, password: 'x-oauth-basic' }),
      author: GIT_AUTHOR,
    });
    console.log(`[GitSync] Pulled from ${remote}`);
  },

  /** Switch to an existing branch or create a new one */
  async checkout(dir: string, branch: string, create = false): Promise<void> {
    if (create) {
      await git.branch({ fs: expoFsAdapter, dir, ref: branch, checkout: true });
    } else {
      await git.checkout({ fs: expoFsAdapter, dir, ref: branch });
    }
  },

  /** Restore a specific file to its last committed state */
  async checkoutFile(dir: string, filepath: string): Promise<void> {
    await git.checkout({ fs: expoFsAdapter, dir, filepaths: [filepath] });
  },

  /** Legacy: stage all + commit + push (kept for backward compat) */
  async commitAndPush(dir: string, message: string, token: string, remote = 'origin'): Promise<void> {
    await GitSyncService.commit(dir, message);
    await GitSyncService.push(dir, token, remote);
  },
};

// ─── Simple Unified Diff ──────────────────────────────────────────────────────

function simpleDiff(oldLines: string[], newLines: string[]): string {
  const result: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    const oldLine = oldLines[i];
    const newLine = newLines[j];

    if (i >= oldLines.length) {
      result.push(`+${newLine}`);
      j++;
    } else if (j >= newLines.length) {
      result.push(`-${oldLine}`);
      i++;
    } else if (oldLine === newLine) {
      result.push(` ${oldLine}`);
      i++; j++;
    } else {
      result.push(`-${oldLine}`);
      result.push(`+${newLine}`);
      i++; j++;
    }
  }

  return result.join('\n');
}
