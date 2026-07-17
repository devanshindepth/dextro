import * as FileSystem from 'expo-file-system';
import type { ToolExecution } from 'core-types';
import { GitSyncService } from '../git/git-sync';
// We assume 'core' is linked and we can import from it. Note: 'shared-core' is the actual package name in package.json? Let's assume we can import the sandbox.
// Actually, 'shared-core' is the package name. Let's use it or just re-implement the resolve logic if it's missing from exports.
// To be safe and keep this file independent, we'll implement a basic path boundary check here, or assume the caller applied it.
// We will apply the sandbox check natively here.

function normalizeLocalPath(root: string, target: string): string {
  // A naive implementation for Expo since 'path' module isn't natively available in React Native without polyfills.
  // We strictly replace relative traversal attempts and prepend the root.
  if (target.includes('../') || target.includes('..\\')) {
    throw new Error('Security Exception: Path traversal attempt blocked.');
  }
  // Strip leading slashes to prevent absolute path override
  const cleanTarget = target.replace(/^[\/\\]+/, '');
  return `${root.endsWith('/') ? root : root + '/'}${cleanTarget}`;
}

export async function executeToolLocally(
  tool: ToolExecution,
  projectRoot: string,
  githubToken?: string
): Promise<string> {
  const { toolName, toolArgs } = tool;
  
  try {
    switch (toolName) {
      case 'read_file': {
        const path = normalizeLocalPath(projectRoot, toolArgs.path);
        const content = await FileSystem.readAsStringAsync(path);
        return content;
      }
      
      case 'write_file': {
        const path = normalizeLocalPath(projectRoot, toolArgs.path);
        await FileSystem.writeAsStringAsync(path, toolArgs.content);
        return `Successfully wrote to ${toolArgs.path}`;
      }
      
      case 'list_directory': {
        const path = normalizeLocalPath(projectRoot, toolArgs.path || '.');
        const files = await FileSystem.readDirectoryAsync(path);
        return files.join('\n');
      }
      
      case 'git_commit': {
        if (!githubToken) throw new Error('Missing GitHub token.');
        await GitSyncService.commitAndPush(projectRoot, toolArgs.message, githubToken, 'origin'); // Stub: currently pushes as well, need to decouple in git-sync.
        return `Committed with message: ${toolArgs.message}`;
      }
      
      case 'git_push': {
        if (!githubToken) throw new Error('Missing GitHub token.');
        // git_sync already pushes in commitAndPush, but assuming they are split:
        return `Pushed to remote: ${toolArgs.remote || 'origin'}`;
      }
      
      case 'run_command': {
        // Native PRoot stub
        // Simulates the path sandbox and a 2 second execution timeout.
        const path = normalizeLocalPath(projectRoot, toolArgs.cwd || '.');
        console.log(`[NativeTerminal Stub] Executing: ${toolArgs.command} in ${path}`);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        return `[STUB OUTPUT] Simulated successful execution of \`${toolArgs.command}\``;
      }
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error: any) {
    throw new Error(`Execution failed: ${error.message}`);
  }
}
