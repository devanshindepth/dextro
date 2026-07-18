/**
 * Dextro Termux Bridge
 *
 * Abstracts shell command execution on Android via Termux's RUN_COMMAND Intent.
 *
 * Architecture:
 * - Termux exposes the RUN_COMMAND Android Intent (NOT an HTTP server)
 * - Dextro must declare com.termux.permission.RUN_COMMAND in its manifest
 * - Termux must have allow-external-apps=true in ~/.termux/termux.properties
 * - Both conditions must be met — miss either and Android denies the intent silently
 *
 * Filesystem note:
 * - Termux home (~) is Termux's private sandbox — inaccessible to Dextro
 * - Shared storage (/storage/emulated/0/Dextro/projects/) is accessible to both
 * - All commands must use absolute paths to shared storage, never ~/
 *
 * Output retrieval:
 * - Short commands: RUN_COMMAND with PendingIntent callback
 * - Long commands: write output to shared storage file, poll for completion
 *
 * Distribution note:
 * - Local shell uses Android's built-in `sh` process via ProcessBuilder.
 * - State is preserved across commands in the persistent shell session.
 */

import { NativeModules, DeviceEventEmitter } from 'react-native';

// ─── Shared Storage Paths ─────────────────────────────────────────────────────



// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommandResult {
  exitCode: number;
  output: string;
  timedOut: boolean;
}

export interface TermuxBridge {
  /**
   * Execute a shell command in Termux.
   * @param command  Shell command string
   * @param cwd      Absolute working directory (must be in shared storage)
   * @param onChunk  Called with incremental stdout/stderr output
   * @param signal   AbortSignal to cancel the command
   * @param timeout  Timeout in milliseconds (default: 60s)
   */
  execute(
    command: string,
    cwd: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    timeout?: number
  ): Promise<CommandResult>;

  /** Check if Termux is installed and external apps are enabled */
  isAvailable(): Promise<boolean>;

  /** Human-readable setup instructions for the user */
  getSetupInstructions(): string;
}

// ─── Local Shell Bridge (Primary Implementation) ───────────────────────────────

export class LocalShellBridge implements TermuxBridge {
  async execute(
    command: string,
    cwd: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    timeout = 60000
  ): Promise<CommandResult> {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { StorageManager } = NativeModules;

    if (!StorageManager || !StorageManager.executeLocalCommand) {
      throw new Error('Native StorageManager module not available. Cannot launch shell.');
    }

    return new Promise((resolve, reject) => {
      let isSettled = false;
      let timer: NodeJS.Timeout | null = null;
      let subscriptionResult: any = null;
      let subscriptionChunk: any = null;
      let accumulatedOutput = '';

      const finish = (result: CommandResult) => {
        if (isSettled) return;
        isSettled = true;
        if (timer) clearTimeout(timer);
        if (subscriptionResult) subscriptionResult.remove();
        if (subscriptionChunk) subscriptionChunk.remove();
        resolve(result);
      };

      // Listen for chunk stream
      subscriptionChunk = DeviceEventEmitter.addListener('ShellOutputChunk', (event) => {
        if (event.jobId === jobId) {
          const chunk = event.chunk || '';
          accumulatedOutput += chunk;
          onChunk(chunk);
        }
      });

      // Listen for completion result
      subscriptionResult = DeviceEventEmitter.addListener('ShellResult', (event) => {
        if (event.jobId === jobId) {
          finish({
            exitCode: event.exitCode,
            output: accumulatedOutput,
            timedOut: false
          });
        }
      });

      // Handle timeout
      timer = setTimeout(() => {
        finish({
          exitCode: -1,
          output: '\n[Command timed out]',
          timedOut: true
        });
      }, timeout);

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          finish({
            exitCode: -1,
            output: '\n[Command aborted]',
            timedOut: false
          });
        }, { once: true });
      }

      // Launch the command
      StorageManager.executeLocalCommand(command, cwd, jobId)
        .catch((err: any) => {
          const errMsg = err?.message || String(err);
          finish({
            exitCode: -1,
            output: `Failed to launch shell: ${errMsg}`,
            timedOut: false
          });
        });
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.execute(
        'echo dextro-ping',
        '/storage/emulated/0',
        () => {},
        undefined,
        5000
      );
      return result.output.includes('dextro-ping');
    } catch (_) {
      return false;
    }
  }

  getSetupInstructions(): string {
    return 'The terminal requires Android storage permissions to operate.';
  }
}
// ─── Stub Bridge (Fallback) ───────────────────────────────────────────────────

/**
 * Stub bridge that returns a helpful error when Termux is unavailable.
 * Used in development or as a fallback if the real bridge fails to initialize.
 */
export class StubTermuxBridge implements TermuxBridge {
  async execute(command: string): Promise<CommandResult> {
    throw new Error(
      `Cannot execute '${command}'.\n\nNative module not linked.`
    );
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }

  getSetupInstructions(): string {
    return new LocalShellBridge().getSetupInstructions();
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

let bridgeInstance: TermuxBridge | null = null;

export function getTermuxBridge(): TermuxBridge {
  if (!bridgeInstance) {
    bridgeInstance = new LocalShellBridge();
  }
  return bridgeInstance;
}
