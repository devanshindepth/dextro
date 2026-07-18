/**
 * Dextro Settings Store
 *
 * Persists user settings using AsyncStorage (non-sensitive) and
 * SecureStore (API keys). This is the single source of truth for
 * all provider configuration and user preferences.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { LLMProvider, SecurityPreset } from 'core-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GlobalSettings {
  defaultProvider: LLMProvider;
  defaultModel: string;
  defaultSecurityPreset: SecurityPreset;
  theme: 'dark' | 'light';
  githubToken?: string; // ref key, actual value in SecureStore
}

const DEFAULT_SETTINGS: GlobalSettings = {
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-5',
  defaultSecurityPreset: 'standard',
  theme: 'dark',
};

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const SETTINGS_KEY = '@dextro_global_settings';
const SECURE_KEY_PREFIX = 'dextro_apikey_';
const GITHUB_TOKEN_KEY = 'dextro_github_token';

// ─── Settings CRUD ────────────────────────────────────────────────────────────

export async function loadSettings(): Promise<GlobalSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Partial<GlobalSettings>): Promise<void> {
  const current = await loadSettings();
  const updated = { ...current, ...settings };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
}

// ─── API Key Management ───────────────────────────────────────────────────────

/** Store an API key in SecureStore (encrypted on-device) */
export async function setApiKey(provider: LLMProvider, key: string): Promise<void> {
  const storageKey = `${SECURE_KEY_PREFIX}${provider}`;
  if (key) {
    await SecureStore.setItemAsync(storageKey, key);
  } else {
    await SecureStore.deleteItemAsync(storageKey);
  }
}

/** Retrieve an API key from SecureStore */
export async function getApiKey(provider: LLMProvider): Promise<string | null> {
  try {
    const storageKey = `${SECURE_KEY_PREFIX}${provider}`;
    return await SecureStore.getItemAsync(storageKey);
  } catch (_) {
    return null;
  }
}

/** Check which providers have API keys configured */
export async function getConfiguredProviders(): Promise<Record<LLMProvider, boolean>> {
  const [anthropic, openai, gemini] = await Promise.all([
    getApiKey('anthropic'),
    getApiKey('openai'),
    getApiKey('gemini'),
  ]);
  return {
    anthropic: !!anthropic,
    openai: !!openai,
    gemini: !!gemini,
  };
}

/** Store the GitHub token for git push operations */
export async function setGithubToken(token: string): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(GITHUB_TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(GITHUB_TOKEN_KEY);
  }
}

/** Retrieve the GitHub token */
export async function getGithubToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(GITHUB_TOKEN_KEY);
  } catch (_) {
    return null;
  }
}
