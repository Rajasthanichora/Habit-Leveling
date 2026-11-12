// ─── Game event bus + idempotent claims store ────────────────────────────────
//
// Single channel every game service uses to announce what just happened
// (toasts, sounds). Pure data — nothing here imports React or other services,
// so any service can import it without cycles.
//
// Claims store: first writer wins (`claim_reward`), every game payout key is
// idempotent by construction — restarts never double-pay.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { withLock, LOCK_KEYS } from './writeLock';

// ─── Event bus ────────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: 'levelup'; level: number; title: string }
  | { type: 'achievement'; title: string }
  | { type: 'claim'; message: string; xp: number }
  | { type: 'coin'; message: string; coins: number }
  | { type: 'penalty'; message: string; coins?: number }
  | { type: 'collapse'; message: string; habitName: string }
  | { type: 'revive'; message: string; habitName: string }
  | { type: 'chest'; message: string; coins: number }
  | { type: 'combo'; message: string; multiplier: number }
  | { type: 'evolve'; message: string; habitName: string }
  | { type: 'prestige'; message: string; count: number }
  | { type: 'season'; message: string; tier: string }
  | { type: 'rebuild'; message: string; habitName: string }
  | { type: 'skill'; message: string };

const listeners = new Set<(event: GameEvent) => void>();

export function subscribeGameEvents(listener: (event: GameEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitGameEvent(event: GameEvent): void {
  listeners.forEach((l) => {
    try {
      l(event);
    } catch {}
  });
}

// ─── Idempotent claims store ──────────────────────────────────────────────────

const CLAIMS_KEY = '@habit_planner_game_claims';

export async function loadClaims(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(CLAIMS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** First call wins; returns true when the reward may be granted. */
export async function claimReward(key: string, dateIso = new Date().toISOString()): Promise<boolean> {
  try {
    // Serialized: two completions landing in the same tick (e.g. perfect-day
    // bonus) both saw an empty claims map and paid the same reward twice.
    return await withLock(LOCK_KEYS.claims, async () => {
      const claims = await loadClaims();
      if (claims[key]) return false;
      claims[key] = dateIso;
      await AsyncStorage.setItem(CLAIMS_KEY, JSON.stringify(claims));
      return true;
    });
  } catch {
    return false;
  }
}

export async function isClaimed(key: string): Promise<boolean> {
  try {
    const claims = await loadClaims();
    return !!claims[key];
  } catch {
    return false;
  }
}
