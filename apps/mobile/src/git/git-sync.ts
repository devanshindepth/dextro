import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import * as FileSystem from 'expo-file-system';
import { expoFsAdapter } from './expo-fs-adapter';

const REPOS_ROOT = `${FileSystem.documentDirectory}repos/`;

/**
 * Dextro Git Sync Service
 * Wraps isomorphic-git with the expo-file-system adapter for background
 * push/pull operations against the remote GitHub relay.
 */
export const GitSyncService = {
  /**
   * Initialise a new local git repo at the given path.
   */
  async init(repoName: string): Promise<string> {
    const dir = `${REPOS_ROOT}${repoName}`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    await git.init({ fs: expoFsAdapter, dir });
    console.log(`[GitSync] Initialized repo at ${dir}`);
    return dir;
  },

  /**
   * Clone a remote repo into local device storage.
   */
  async clone(remoteUrl: string, repoName: string, token: string): Promise<string> {
    const dir = `${REPOS_ROOT}${repoName}`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
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

  /**
   * Stage all changes, commit, and push to remote.
   */
  async commitAndPush(
    dir: string,
    message: string,
    token: string,
    remote = 'origin'
  ): Promise<void> {
    await git.add({ fs: expoFsAdapter, dir, filepath: '.' });
    const sha = await git.commit({
      fs: expoFsAdapter,
      dir,
      message,
      author: { name: 'Dextro Mobile', email: 'dextro@local' },
    });
    await git.push({
      fs: expoFsAdapter,
      http,
      dir,
      remote,
      onAuth: () => ({ username: token, password: 'x-oauth-basic' }),
    });
    console.log(`[GitSync] Committed ${sha} and pushed to ${remote}`);
  },

  /**
   * Pull latest changes from remote.
   */
  async pull(dir: string, token: string, remote = 'origin'): Promise<void> {
    await git.pull({
      fs: expoFsAdapter,
      http,
      dir,
      remote,
      onAuth: () => ({ username: token, password: 'x-oauth-basic' }),
      author: { name: 'Dextro Mobile', email: 'dextro@local' },
    });
    console.log(`[GitSync] Pulled from ${remote}`);
  },
};
