/**
 * Dextro Setup Checker
 *
 * Validates that all prerequisites for the agent are in place:
 * 1. Shared external storage is writable by this app
 * 2. Termux is installed
 * 3. Termux's external app access is enabled
 *
 * The spike validation (Test 0 from the verification plan) lives here.
 * Run checkAll() before showing the main agent UI.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { NativeModules, Platform } from 'react-native';
import type { SetupStatus } from 'core-types';

const DEXTRO_SHARED_ROOT = '/storage/emulated/0/Dextro';
const BRIDGE_DIR = `${DEXTRO_SHARED_ROOT}/.bridge`;
const SPIKE_TEST_FILE = `${DEXTRO_SHARED_ROOT}/spike-test.txt`;
const SPIKE_TEST_CONTENT = `dextro-fs-spike-${Date.now()}`;

const ensureUri = (path: string): string => {
  if (path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  return `file://${path}`;
};

// ─── Individual Checks ────────────────────────────────────────────────────────

/**
 * Query whether MANAGE_EXTERNAL_STORAGE is granted.
 *
 * PermissionsAndroid.check() always returns false for this special "app-ops"
 * permission. The only correct API is Environment.isExternalStorageManager()
 * which we expose via our native StorageManagerModule.
 */
async function isExternalStorageManagerGranted(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const { StorageManager } = NativeModules;
    if (!StorageManager?.isExternalStorageManager) {
      // Native module not available — fall through to write-based check
      return true;
    }
    return await StorageManager.isExternalStorageManager();
  } catch {
    return true; // fail open so the write-based check can decide
  }
}

/**
 * Test 0 (from verification plan): write a file from Expo, verify it lands
 * at the shared storage path. This validates that expo-file-system can reach
 * /storage/emulated/0/ with the current permissions.
 */
export async function checkSharedStoragePermission(): Promise<'granted' | 'denied' | 'unknown'> {
  // ── Step 1: Fast native check via Environment.isExternalStorageManager() ────
  // This is the only correct way to query MANAGE_EXTERNAL_STORAGE on Android 11+.
  // PermissionsAndroid.check() always returns false for this special permission.
  const nativeGranted = await isExternalStorageManagerGranted();
  if (!nativeGranted) {
    return 'denied';
  }

  // ── Step 2: Write test via native Java File API ───────────────────────────────
  // expo-file-system/legacy applies its own internal scope check and blocks writes
  // to /storage/emulated/0/ even when MANAGE_EXTERNAL_STORAGE is granted by the OS.
  // We bypass this by calling our native StorageManagerModule which uses Java's
  // File API directly — it correctly honours the OS-level permission grant.
  try {
    const { StorageManager } = NativeModules;
    if (StorageManager?.testWrite) {
      const ok: boolean = await StorageManager.testWrite(DEXTRO_SHARED_ROOT);
      return ok ? 'granted' : 'denied';
    }
  } catch (err: unknown) {
    console.warn('[SetupChecker] Native write test failed:', err);
  }

  // ── Step 3: Fallback to expo-file-system (older devices / non-Android) ───────
  try {
    const rootUri = ensureUri(DEXTRO_SHARED_ROOT);
    const testFileUri = ensureUri(SPIKE_TEST_FILE);
    await FileSystem.makeDirectoryAsync(rootUri, { intermediates: true });
    await FileSystem.writeAsStringAsync(testFileUri, SPIKE_TEST_CONTENT);
    const readBack = await FileSystem.readAsStringAsync(testFileUri);
    await FileSystem.deleteAsync(testFileUri, { idempotent: true });
    if (readBack === SPIKE_TEST_CONTENT) return 'granted';
    return 'denied';
  } catch (err: unknown) {
    console.warn('[SetupChecker] Shared storage write test failed:', err);
    const msg = err instanceof Error ? err.message : String(err);
    const lowerMsg = msg.toLowerCase();
    if (
      lowerMsg.includes('permission') ||
      lowerMsg.includes('eacces') ||
      lowerMsg.includes('eperm') ||
      lowerMsg.includes('writable') ||
      lowerMsg.includes('readable')
    ) {
      return 'denied';
    }
    return 'unknown';
  }
}


/**
 * Ensure the bridge directory in shared storage is set up.
 * Uses native module so it works even when expo-file-system scope-blocks the path.
 */
export async function ensureBridgeDirectory(): Promise<boolean> {
  try {
    const { StorageManager } = NativeModules;
    if (StorageManager?.ensureDirectory) {
      return await StorageManager.ensureDirectory(BRIDGE_DIR);
    }
    // Fallback
    await FileSystem.makeDirectoryAsync(ensureUri(BRIDGE_DIR), { intermediates: true });
    return true;
  } catch (_) {
    return false;
  }
}


// ─── Combined Check ───────────────────────────────────────────────────────────

export async function checkAll(): Promise<SetupStatus> {
  const sharedStoragePermission = await checkSharedStoragePermission();

  if (sharedStoragePermission === 'granted') {
    await ensureBridgeDirectory();
  }

  const setupComplete = sharedStoragePermission === 'granted';

  return {
    sharedStoragePermission,
    setupComplete,
  };
}

// ─── Onboarding State ─────────────────────────────────────────────────────────

export function getSetupSteps(status: SetupStatus): Array<{
  id: string;
  label: string;
  description: string;
  done: boolean;
  required: boolean;
}> {
  return [
    {
      id: 'storage',
      label: 'Storage Permission',
      description:
        'Dextro needs access to shared storage so both the agent and Termux can see the same project files. Tap "Grant" to allow.',
      done: status.sharedStoragePermission === 'granted',
      required: true,
    }
  ];
}
