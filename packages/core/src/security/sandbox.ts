import * as path from 'path';

/**
 * Validates that a target path resolves safely within the provided project root.
 * Prevents directory traversal attacks (e.g., ../../../etc/passwd).
 * 
 * @param projectRoot Absolute path to the user's project directory.
 * @param targetPath The requested file or directory path (relative or absolute).
 * @returns The resolved absolute path if safe.
 * @throws Error if the path escapes the project root.
 */
export function resolveAndJailPath(projectRoot: string, targetPath: string): string {
  // 1. Normalize both paths
  const normalizedRoot = path.normalize(projectRoot);
  
  // 2. Resolve the target path against the root (handles both absolute and relative targets)
  const resolvedTarget = path.resolve(normalizedRoot, targetPath);
  
  // 3. Ensure the resolved target starts with the normalized root
  // We append a path separator to ensure we don't allow partial matches
  // (e.g., root: /repo, target: /repo-hacked)
  const rootWithSep = normalizedRoot.endsWith(path.sep) 
    ? normalizedRoot 
    : normalizedRoot + path.sep;
    
  if (resolvedTarget !== normalizedRoot && !resolvedTarget.startsWith(rootWithSep)) {
    throw new Error(`Security Exception: Path traversal detected. Target path escapes the project root.`);
  }

  return resolvedTarget;
}
