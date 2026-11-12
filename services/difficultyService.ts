// ─── Game difficulty engine (Phase 5) ────────────────────────────────────────
//
// The difficulty knob shapes how hard the game is to GROW (XP curve length,
// XP income, coin income). It is deliberately separate from the penalty
// intensity: penalties = how hard it hits, difficulty = how hard it climbs.
//
// Storage: the setting rides on the existing penalty-settings store
// (`difficulty` field) so the Settings → Game & Penalties view keeps one
// home for the whole "game feel" block. Multipliers are cached at module
// level — the synchronous getters (xpForLevel!) must never await.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DIFFICULTY_PRESETS, GameDifficulty } from './gameRules';

/** Migration door: v2 users keep their choice even if settings load fails. */
const DIFF_BACKUP_KEY = '@habit_planner_difficulty_v1';

const DEFAULT_KEY: GameDifficulty = 'gentle';

let cached: GameDifficulty = DEFAULT_KEY;

export function currentDifficulty(): GameDifficulty {
  return cached;
}

/** Pure multipliers — safe to call before boot (fall back to gentle = ×1). */
export function xpNeedMult(): number {
  return DIFFICULTY_PRESETS[cached]?.xpNeedMult ?? 1;
}
export function xpEarnMult(): number {
  return DIFFICULTY_PRESETS[cached]?.xpEarnMult ?? 1;
}
export function coinEarnMult(): number {
  return DIFFICULTY_PRESETS[cached]?.coinEarnMult ?? 1;
}

/**
 * Legend-skill win scaling — a proof must be harder to earn on stricter
 * difficulties: gentle ×1 · balanced ×1.25 · hardcore ×1.5 (rounded up).
 */
export function legendWinScale(): number {
  if (cached === 'balanced') return 1.25;
  if (cached === 'hardcore') return 1.5;
  return 1;
}

/** Scaled-up requirement for one legend node (never below the base). */
export function scaledWins(baseWins: number): number {
  return Math.max(baseWins, Math.ceil(baseWins * legendWinScale()));
}

/**
 * Legend Vault shop gates stretch with difficulty: an item marked
 * `milestone: true` with a base level L opens at L × {1, 1.2, 1.4}.
 * Regular minLevel items keep their plain gate.
 */
export function milestoneGateFor(baseLevel?: number, milestone = false): number | undefined {
  if (baseLevel == null) return undefined;
  if (!milestone) return baseLevel;
  if (cached === 'balanced') return Math.round(baseLevel * 1.2);
  if (cached === 'hardcore') return Math.round(baseLevel * 1.4);
  return baseLevel;
}

/**
 * Reads the difficulty from the penalty settings store (via a tiny direct
 * read to avoid a service cycle) and primes the cache. Called once at app
 * boot from HabitContext.
 */
export async function initDifficulty(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem('@habit_planner_penalty_settings');
    const parsed = raw ? (JSON.parse(raw) as { difficulty?: string }) : null;
    const key = parsed?.difficulty;
    const valid: GameDifficulty | undefined =
      key === 'gentle' || key === 'balanced' || key === 'hardcore' ? key : undefined;
    if (valid) {
      cached = valid;
      return;
    }
    // Load the backup copy (older parity door).
    const backup = await AsyncStorage.getItem(DIFF_BACKUP_KEY);
    if (backup === 'gentle' || backup === 'balanced' || backup === 'hardcore') {
      cached = backup;
    }
  } catch {
    cached = DEFAULT_KEY;
  }
}

/** Live-switch the difficulty (Settings view) + persist both mirrors. */
export async function applyDifficulty(key: GameDifficulty): Promise<void> {
  if (!DIFFICULTY_PRESETS[key]) return;
  cached = key;
  try {
    const raw = await AsyncStorage.getItem('@habit_planner_penalty_settings');
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.difficulty = key;
    await AsyncStorage.setItem('@habit_planner_penalty_settings', JSON.stringify(parsed));
    await AsyncStorage.setItem(DIFF_BACKUP_KEY, key);
  } catch {}
}

export const DIFFICULTY_ORDER: GameDifficulty[] = ['gentle', 'balanced', 'hardcore'];
