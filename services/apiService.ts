import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ApiProvider, ApiConfig, DEFAULT_API_CONFIG, AnalysisConfig, DEFAULT_ANALYSIS_CONFIG, AnalysisHistoryEntry } from './types';

const GEMINI_KEY_STORE = '@secure_gemini_api_key';
const OPENROUTER_KEY_STORE = '@secure_openrouter_api_key';
const GEMINI_FALLBACK_KEY = '@fallback_gemini_api_key';
const OPENROUTER_FALLBACK_KEY = '@fallback_openrouter_api_key';
const API_CONFIG_KEY = '@habit_planner_api_config';

const isWeb = Platform.OS === 'web';

// ─── Secure Key Storage ──
// Uses expo-secure-store on native (iOS Keychain / Android Keystore).
// Falls back to AsyncStorage on web where secure storage isn't available.

async function saveSecureKey(storeKey: string, fallbackKey: string, value: string): Promise<void> {
  if (value) {
    if (isWeb) {
      await AsyncStorage.setItem(fallbackKey, value);
    } else {
      try {
        await SecureStore.setItemAsync(storeKey, value);
      } catch {
        try { await AsyncStorage.setItem(fallbackKey, value); } catch {}
      }
    }
  } else {
    if (isWeb) {
      try { await AsyncStorage.removeItem(fallbackKey); } catch {}
    } else {
      try {
        await SecureStore.deleteItemAsync(storeKey);
      } catch {
        try { await AsyncStorage.removeItem(fallbackKey); } catch {}
      }
    }
  }
}

async function loadSecureKey(storeKey: string, fallbackKey: string): Promise<string> {
  if (isWeb) {
    try {
      const val = await AsyncStorage.getItem(fallbackKey);
      return val ?? '';
    } catch {
      return '';
    }
  }
  try {
    const val = await SecureStore.getItemAsync(storeKey);
    if (val) return val;
  } catch {}
  try {
    const val = await AsyncStorage.getItem(fallbackKey);
    return val ?? '';
  } catch {
    return '';
  }
}

// ─── Non-sensitive config (model selection) stored in AsyncStorage ──

async function loadApiModelsConfig(): Promise<Pick<ApiConfig, 'gemini' | 'openrouter'>> {
  try {
    const raw = await AsyncStorage.getItem(API_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        gemini: { model: parsed.gemini?.model ?? DEFAULT_API_CONFIG.gemini.model, apiKey: '' },
        openrouter: { model: parsed.openrouter?.model ?? DEFAULT_API_CONFIG.openrouter.model, apiKey: '' },
      };
    }
  } catch {}
  return {
    gemini: { model: DEFAULT_API_CONFIG.gemini.model, apiKey: '' },
    openrouter: { model: DEFAULT_API_CONFIG.openrouter.model, apiKey: '' },
  };
}

async function saveApiModelsConfig(provider: ApiProvider, model: string): Promise<void> {
  const config = await loadApiModelsConfig();
  config[provider].model = model;
  await AsyncStorage.setItem(API_CONFIG_KEY, JSON.stringify({
    gemini: { model: config.gemini.model },
    openrouter: { model: config.openrouter.model },
  }));
}

// ─── Public API ──

export async function loadApiConfig(): Promise<ApiConfig> {
  const [geminiApiKey, openrouterApiKey, modelsConfig] = await Promise.all([
    loadSecureKey(GEMINI_KEY_STORE, GEMINI_FALLBACK_KEY),
    loadSecureKey(OPENROUTER_KEY_STORE, OPENROUTER_FALLBACK_KEY),
    loadApiModelsConfig(),
  ]);
  return {
    gemini: { apiKey: geminiApiKey, model: modelsConfig.gemini.model },
    openrouter: { apiKey: openrouterApiKey, model: modelsConfig.openrouter.model },
  };
}

export async function saveApiKey(provider: ApiProvider, apiKey: string): Promise<void> {
  if (provider === 'gemini') {
    await saveSecureKey(GEMINI_KEY_STORE, GEMINI_FALLBACK_KEY, apiKey);
  } else {
    await saveSecureKey(OPENROUTER_KEY_STORE, OPENROUTER_FALLBACK_KEY, apiKey);
  }
}

export async function saveApiModel(provider: ApiProvider, model: string): Promise<void> {
  await saveApiModelsConfig(provider, model);
}

export async function clearApiKey(provider: ApiProvider): Promise<void> {
  if (provider === 'gemini') {
    await saveSecureKey(GEMINI_KEY_STORE, GEMINI_FALLBACK_KEY, '');
  } else {
    await saveSecureKey(OPENROUTER_KEY_STORE, OPENROUTER_FALLBACK_KEY, '');
  }
}

// ─── API Testing ──

interface TestResult {
  success: boolean;
  message: string;
}

export async function testApiKey(provider: ApiProvider, apiKey: string): Promise<TestResult> {
  try {
    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { method: 'GET' }
      );
      if (res.ok) {
        return { success: true, message: 'Gemini API key is valid' };
      }
      const body = await res.json().catch(() => ({}));
      return { success: false, message: body?.error?.message || `HTTP ${res.status}` };
    } else {
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        return { success: true, message: 'OpenRouter API key is valid' };
      }
      const body = await res.json().catch(() => ({}));
      return { success: false, message: body?.error?.message || `HTTP ${res.status}` };
    }
  } catch (e: any) {
    return { success: false, message: e?.message || 'Network error' };
  }
}

// ─── Active Provider ──

const ACTIVE_PROVIDER_KEY = '@habit_planner_active_provider';

export async function saveActiveProvider(provider: ApiProvider): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PROVIDER_KEY, provider);
}

export async function loadActiveProvider(): Promise<ApiProvider> {
  try {
    const val = await AsyncStorage.getItem(ACTIVE_PROVIDER_KEY);
    if (val === 'gemini' || val === 'openrouter') return val;
  } catch {}
  return 'gemini';
}

// ─── Analysis Config ──

const ANALYSIS_CONFIG_KEY_PREFIX = '@habit_planner_analysis_config_';

export async function saveAnalysisConfig(config: AnalysisConfig, sectionId?: string): Promise<void> {
  const key = ANALYSIS_CONFIG_KEY_PREFIX + (sectionId || 'default');
  await AsyncStorage.setItem(key, JSON.stringify(config));
}

export async function loadAnalysisConfig(sectionId?: string): Promise<AnalysisConfig> {
  try {
    const key = ANALYSIS_CONFIG_KEY_PREFIX + (sectionId || 'default');
    const raw = await AsyncStorage.getItem(key);
    if (raw) return { ...DEFAULT_ANALYSIS_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_ANALYSIS_CONFIG };
}

// ─── Analysis History ──

const HISTORY_KEY_PREFIX = '@habit_planner_analysis_history_';

export async function getAnalysisHistory(sectionId?: string): Promise<AnalysisHistoryEntry[]> {
  try {
    const key = HISTORY_KEY_PREFIX + (sectionId || 'default');
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addAnalysisHistoryEntry(entry: AnalysisHistoryEntry, sectionId?: string): Promise<void> {
  const key = HISTORY_KEY_PREFIX + (sectionId || 'default');
  const history = await getAnalysisHistory(sectionId);
  history.unshift(entry);
  const maxEntries = 100;
  if (history.length > maxEntries) history.length = maxEntries;
  await AsyncStorage.setItem(key, JSON.stringify(history));
}

export async function clearAnalysisHistory(sectionId?: string): Promise<void> {
  const key = HISTORY_KEY_PREFIX + (sectionId || 'default');
  await AsyncStorage.removeItem(key);
}

// ─── Model Fetching ──

export interface ModelOption {
  id: string;
  name: string;
  free: boolean;
}

export async function fetchModels(provider: ApiProvider, apiKey: string): Promise<ModelOption[]> {
  try {
    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        { method: 'GET' }
      );
      if (!res.ok) return [];
      const body = await res.json();
      const models: ModelOption[] = (body.models || [])
        .filter((m: any) =>
          m.name &&
          m.supportedGenerationMethods?.includes('generateContent')
        )
        .map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name.replace('models/', ''),
          free: true,
        }));
      return models;
    } else {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return [];
      const body = await res.json();
      const models: ModelOption[] = (body.data || [])
        .filter((m: any) => !m.pricing || (parseFloat(m.pricing?.prompt || '0') === 0 && parseFloat(m.pricing?.completion || '0') === 0))
        .map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          free: !m.pricing || (parseFloat(m.pricing?.prompt || '0') === 0 && parseFloat(m.pricing?.completion || '0') === 0),
        }));
      return models;
    }
  } catch {
    return [];
  }
}

export async function testModel(provider: ApiProvider, apiKey: string, model: string): Promise<TestResult> {
  try {
    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Reply with just: OK' }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
        }
      );
      if (res.ok) {
        return { success: true, message: `Model "${model}" is working correctly` };
      }
      const body = await res.json().catch(() => ({}));
      return { success: false, message: body?.error?.message || `HTTP ${res.status}` };
    } else {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://habit-tracker.app',
          'X-Title': 'Habit Tracker AI',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Reply with just: OK' }],
          max_tokens: 10,
        }),
      });
      if (res.ok) {
        return { success: true, message: `Model "${model}" is working correctly` };
      }
      const body = await res.json().catch(() => ({}));
      return { success: false, message: body?.error?.message || body?.error || `HTTP ${res.status}` };
    }
  } catch (e: any) {
    return { success: false, message: e?.message || 'Network error' };
  }
}
