// ─── Legacy clean-up: purge theme + AI/analysis leftovers ────────────────────
//
// The runtime theme engine (mode/accent switching) and the whole AI stack
// (Gemini / OpenRouter chat + analysis) were removed from the app. Old
// installs still carry their storage, so this one-shot boot cleaner wipes:
//   • Async keys: saved theme prefs, API config, provider choice, per-section
//     analysis configs + history, and the non-encrypted API-key fallbacks.
//   • Secure keys: the encrypted Gemini / OpenRouter API keys.
//   • Filesystem: the theme mirror file written by the old theme boot.
//
// Everything is removal-based and idempotent — safe to run on every cold
// start; users who never had the old keys pay only one getAllKeys() scan.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';

/** Plain (pre-encryption) API-key fallbacks written by the old apiService. */
const LEGACY_ASYNC_KEYS = [
  '@habit_planner_theme',
  '@habit_planner_api_config',
  '@habit_planner_active_provider',
  '@fallback_gemini_api_key',
  '@fallback_openrouter_api_key',
];

/** Key prefixes swept out (each match removed) — analysis config + history. */
const LEGACY_ASYNC_PREFIXES = [
  '@habit_planner_analysis_config',
  '@habit_planner_analysis_history',
];

/** Encrypted keys kept in SecureStore by the old apiService. */
const LEGACY_SECURE_KEYS = [
  '@secure_gemini_api_key',
  '@secure_openrouter_api_key',
];

/** Mirror file the old theme boot wrote next to the documents dir. */
const LEGACY_MIRROR_FILE = 'habit-theme.json';

let done = false;

/**
 * Removes every leftover of the removed theme / AI systems. Idempotent and
 * cheap after the first run (module flag). Never throws — a failed wipe must
 * not block app boot.
 */
export async function runLegacyCleanup(): Promise<void> {
  if (done) return;
  done = true;

  try {
    const all = await AsyncStorage.getAllKeys();

    const toRemove = [
      ...LEGACY_ASYNC_KEYS,
      ...all.filter((k) => LEGACY_ASYNC_PREFIXES.some((p) => k.startsWith(p))),
    ];
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch {}

  try {
    for (const key of LEGACY_SECURE_KEYS) {
      await SecureStore.deleteItemAsync(key).catch(() => {});
    }
  } catch {}

  try {
    const mirror = new File(Paths.document, LEGACY_MIRROR_FILE);
    if (mirror.exists) mirror.delete();
  } catch {}
}
