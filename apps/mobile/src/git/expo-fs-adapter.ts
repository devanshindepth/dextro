import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';

/**
 * Dextro: isomorphic-git expo-file-system adapter
 *
 * isomorphic-git uses a BYOFS (Bring Your Own File System) pattern.
 * This adapter bridges expo-file-system's API to the Node.js fs.promises
 * interface that isomorphic-git expects.
 *
 * Reference: https://isomorphic-git.org/docs/en/plugin_fs
 */

type Encoding = 'utf8' | 'binary' | undefined;

const ensureUri = (path: string): string => {
  if (path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  return `file://${path}`;
};

export const expoFsAdapter = {
  promises: {
    readFile: async (filePath: string, options?: { encoding?: Encoding }) => {
      const enc = options?.encoding === 'utf8'
        ? FileSystem.EncodingType.UTF8
        : FileSystem.EncodingType.Base64;

      const content = await FileSystem.readAsStringAsync(ensureUri(filePath), { encoding: enc });

      if (enc === FileSystem.EncodingType.UTF8) {
        return content; // string
      }
      return Buffer.from(content, 'base64'); // Uint8Array / Buffer
    },

    writeFile: async (filePath: string, data: string | Uint8Array, options?: { encoding?: Encoding }) => {
      let encoding = FileSystem.EncodingType.UTF8;
      let content: string;

      if (typeof data === 'string') {
        content = data;
        encoding = (options?.encoding === 'utf8' || !options?.encoding)
          ? FileSystem.EncodingType.UTF8
          : FileSystem.EncodingType.Base64;
      } else {
        // Binary data (Buffer / Uint8Array)
        content = Buffer.from(data).toString('base64');
        encoding = FileSystem.EncodingType.Base64;
      }

      await FileSystem.writeAsStringAsync(ensureUri(filePath), content, { encoding });
    },

    mkdir: async (dirPath: string, _options?: { recursive?: boolean }) => {
      await FileSystem.makeDirectoryAsync(ensureUri(dirPath), { intermediates: true });
    },

    readdir: async (dirPath: string): Promise<string[]> => {
      return await FileSystem.readDirectoryAsync(ensureUri(dirPath));
    },

    stat: async (filePath: string) => {
      const info = await FileSystem.getInfoAsync(ensureUri(filePath), { size: true } as any);
      if (!info.exists) {
        const err = new Error(`ENOENT: no such file or directory, stat '${filePath}'`) as Error & { code?: string };
        err.code = 'ENOENT';
        throw err;
      }
      const isDir = info.isDirectory;
      return {
        isFile: () => !isDir,
        isDirectory: () => isDir,
        isSymbolicLink: () => false,
        size: (info as any).size ?? 0,
        mtimeMs: ((info as any).modificationTime ?? 0) * 1000,
        ctimeMs: ((info as any).modificationTime ?? 0) * 1000,
        mode: isDir ? 0o40755 : 0o100644,
      };
    },

    lstat: async (filePath: string) => {
      // expo-file-system has no symlink support; lstat = stat
      return expoFsAdapter.promises.stat(filePath);
    },

    unlink: async (filePath: string) => {
      await FileSystem.deleteAsync(ensureUri(filePath), { idempotent: true });
    },

    rmdir: async (dirPath: string) => {
      await FileSystem.deleteAsync(ensureUri(dirPath), { idempotent: true });
    },

    rename: async (oldPath: string, newPath: string) => {
      await FileSystem.moveAsync({ from: ensureUri(oldPath), to: ensureUri(newPath) });
    },
  },
};
