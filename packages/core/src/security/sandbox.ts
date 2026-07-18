/**
 * Dextro Path Sandbox
 *
 * Validates that a target path resolves safely within the provided project root.
 * Prevents directory traversal attacks (e.g., ../../../etc/passwd).
 *
 * React Native safe implementation: no path module dependency.
 */

// ─── React Native Safe Implementation ────────────────────────────────────────

/**
 * React Native / Expo safe path jailing — no Node.js 'path' module dependency.
 *
 * Normalizes by resolving '..' segments manually, then prefix-checks against root.
 *
 * @param projectRoot Absolute project root path (shared storage path).
 * @param targetPath  Relative path from the project root.
 * @returns Absolute resolved path, guaranteed to be within projectRoot.
 * @throws  Error if the path escapes the project root.
 */
export function resolveAndJailPathRN(projectRoot: string, targetPath: string): string {
  // Normalize slashes to forward slash (Android uses forward slashes)
  const normalizeSlashes = (p: string) => p.replace(/\\/g, '/');

  const root = normalizeSlashes(projectRoot).replace(/\/$/, '');
  const target = normalizeSlashes(targetPath);

  // Build segments for resolution
  const isAbsolute = target.startsWith('/');
  const baseParts = isAbsolute ? [] : root.split('/').filter(Boolean);
  const targetParts = target.split('/').filter(Boolean);

  const resolved: string[] = [...baseParts];

  for (const part of targetParts) {
    if (part === '..') {
      if (resolved.length > 0) resolved.pop();
    } else if (part !== '.') {
      resolved.push(part);
    }
  }

  const resolvedPath = '/' + resolved.join('/');

  // Jail check: resolved path must start with the root
  const rootWithSlash = root.endsWith('/') ? root : root + '/';
  if (resolvedPath !== root && !resolvedPath.startsWith(rootWithSlash)) {
    throw new Error(
      `Security: Path traversal detected. '${targetPath}' escapes the project root '${projectRoot}'.`
    );
  }

  return resolvedPath;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Shared External Storage root for Dextro projects.
 * Both Expo and Termux must target this base when configured correctly.
 */
export const SHARED_STORAGE_ROOT = '/storage/emulated/0/Dextro/projects';

/**
 * Build the canonical project root path for a given project name.
 */
export function getProjectRoot(projectName: string): string {
  const safeName = projectName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `${SHARED_STORAGE_ROOT}/${safeName}`;
}
