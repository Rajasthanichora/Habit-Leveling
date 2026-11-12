// ─── 7-Day Challenge 🏆 ──────────────────────────────────────────────────────
//
// One active challenge at a time: pick a habit, hold its live streak to 7.
// The win condition reuses the same streak engine the app already trusts
// (computeHabitStreak), so freezes and weekly-offs behave identically here.
//
// Policy:
//   • Target 7 scheduled days — checked against the CURRENT live streak.
//   • Abandon anytime, zero penalty (a challenge is a choice, not homework).
//   • Success: +40 XP, +15🪙 — once per habit, ever (`challenge_<habitId>`).
//     Small on purpose: the real prize is the streak itself + history badge.
//   • No duplicate active challenge per habit; one slot globally.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit, HabitCompletion } from './types';
import { COIN_LABELS } from './gameRules';
import { claimReward, emitGameEvent } from './gameBus';
import { computeHabitStreak, loadFreezeStore, frozenDatesForHabit } from './streakService';
import { earnCoins } from './economyService';
import { grantXpBonus } from './xpService';
import { formatDate, todayStr } from './recurrenceService';
import { withLock, LOCK_KEYS } from './writeLock';

const KEY = '@habit_planner_challenge_v1';

export const CHALLENGE_TARGET_DAYS = 7;
export const CHALLENGE_REWARD_XP = 40;
export const CHALLENGE_REWARD_COINS = 15;

export interface ChallengeActive {
  habitId: string;
  habitName: string;
  startedAtIso: string;
  target: number;
}

export interface ChallengeHistoryEntry {
  habitId: string;
  habitName: string;
  completedAtIso: string;
}

export interface ChallengeStore {
  version: 1;
  active: ChallengeActive | null;
  history: ChallengeHistoryEntry[];
}

const EMPTY: ChallengeStore = { version: 1, active: null, history: [] };

export async function loadChallenge(): Promise<ChallengeStore> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ChallengeStore) : null;
    return {
      version: 1,
      active: parsed?.active ?? null,
      history: Array.isArray(parsed?.history) ? parsed!.history.slice(-20) : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

async function saveChallenge(store: ChallengeStore): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(store));
  } catch {}
}

/** Starts a challenge for a habit — one active slot, no duplicates.
 *  Serialized: the HQ screen auto-evaluates on every refresh; without the
 *  lock an evaluation write could resurrect the slot a Start just wrote (or
 *  vice versa lose it). */
export async function startChallenge(habit: Habit): Promise<boolean> {
  return withLock(LOCK_KEYS.challenge, async () => {
    const store = await loadChallenge();
    if (store.active) return false;
    if (store.history.some((h) => h.habitId === habit.id)) return false; // already conquered
    store.active = {
      habitId: habit.id,
      habitName: habit.name,
      startedAtIso: new Date().toISOString(),
      target: CHALLENGE_TARGET_DAYS,
    };
    await saveChallenge(store);
    return true;
  });
}

/** Clears the active slot — no strings attached. */
export async function abandonChallenge(): Promise<void> {
  await withLock(LOCK_KEYS.challenge, async () => {
    const store = await loadChallenge();
    store.active = null;
    await saveChallenge(store);
  });
}

export interface ChallengeEval {
  store: ChallengeStore;
  /** Live streak of the active habit right now. */
  progress: number;
  target: number;
  /** True when this call completed the challenge (payout happened). */
  justCompleted: boolean;
}

/**
 * Re-checks the active challenge against the habit's live streak. Call after
 * completion refreshes (HQ screen mount / completion-driven reloads).
 */
export async function evaluateChallenge(habits: Habit[], completions: HabitCompletion[]): Promise<ChallengeEval> {
  return withLock(LOCK_KEYS.challenge, async () => {
  const store = await loadChallenge();
  let justCompleted = false;

  const active = store.active;
  let progress = 0;

  if (active) {
    let habit = habits.find((h) => h.id === active.habitId);
    // Boot race: `habits` can arrive as an empty array before storage loads.
    // Treating that as "habit deleted" erased active challenges on every cold
    // start. When the incoming list is empty, re-check against storage before
    // declaring the habit gone.
    if (!habit && habits.length === 0) {
      try {
        const services = await import('./habitService');
        habit = (await services.loadHabits()).find((h) => h.id === active.habitId);
      } catch {}
    }
    if (!habit || habit.archived) {
      // Habit vanished → challenge evaporates silently.
      store.active = null;
      await saveChallenge(store);
    } else {
      try {
        // Credited keys — quantity habits count as done with ANY progress.
        // Only completions made ON or AFTER the challenge started count:
        // without this, an already-high streak won the challenge instantly
        // on the next evaluation tick.
        const startedDate = formatDate(new Date(active.startedAtIso));
        const doneKeys = new Set(
          completions
            .filter((c) => (c.completed || (c.count ?? 0) > 0) && c.date >= startedDate)
            .map((c) => c.key)
        );
        const freezeStore = await loadFreezeStore();
        progress = computeHabitStreak(habit, doneKeys, todayStr(), frozenDatesForHabit(freezeStore, habit.id));
      } catch {
        progress = 0;
      }

      if (progress >= active.target) {
        // ✦ Win — once per habit, ever. 🐉 Momentum Seal / Discipline Titan
        // legend nodes boost the payout (+50% each, additive).
        if (await claimReward(`challenge_${active.habitId}`)) {
          let rewardMult = 1;
          try {
            const skill = await import('./skillService');
            rewardMult = (await skill.challengeRewardMult()) || 1;
          } catch {}
          const xp = await grantXpBonus(Math.round(CHALLENGE_REWARD_XP * rewardMult), '🏆 Challenge conquered');
          const coinPayout = Math.round(CHALLENGE_REWARD_COINS * rewardMult);
          await earnCoins(
            coinPayout,
            COIN_LABELS.bonus,
            { claimKey: `challenge_coins_${active.habitId}`, silent: true }
          );
          store.history.unshift({
            habitId: active.habitId,
            habitName: active.habitName,
            completedAtIso: todayStr(),
          });
          emitGameEvent({
            type: 'achievement',
            title: `🏆 7-Day Challenge conquered: ${active.habitName}! +${xp.total} XP · +${coinPayout}🪙`,
          });
          store.active = null;
          justCompleted = true;
          await saveChallenge(store);
          // A fresh win may complete a legend counter (challenge ledger).
          try {
            await (await import('./skillService')).checkLegendSkills();
          } catch {}
        } else {
          // Already conquered earlier (edge: stale active) → clean up quietly.
          store.active = null;
          await saveChallenge(store);
        }
      }
    }
  }

  return { store, progress, target: CHALLENGE_TARGET_DAYS, justCompleted };
  });
}

/** Habits the user may pick a new challenge for (never conquered, active app-owned). */
export function challengeCandidates(habits: Habit[], history: ChallengeHistoryEntry[]): Habit[] {
  const taken = new Set(history.map((h) => h.habitId));
  return habits.filter((h) => !h.archived && !taken.has(h.id));
}
