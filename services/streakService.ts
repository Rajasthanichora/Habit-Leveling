import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit, HabitCompletion, GAME_RULES } from './types';
import { isHabitActiveOnDate, formatDate, parseDate } from './recurrenceService';
import { withLock, LOCK_KEYS } from './writeLock';

const FREEZE_KEY = '@habit_planner_freezes';

export interface FreezeStore {
  /** habitId_date → ISO timestamp when the freeze was applied. */
  days: Record<string, string>;
  wallet: {
    month: string;      // 'YYYY-MM'
    used: number;
    everUsed: number;   // lifetime (comeback-king badge)
  };
}

export const EMPTY_FREEZE_STORE: FreezeStore = {
  days: {},
  wallet: { month: '', used: 0, everUsed: 0 },
};

function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export async function loadFreezeStore(): Promise<FreezeStore> {
  try {
    const raw = await AsyncStorage.getItem(FREEZE_KEY);
    const parsed = raw ? (JSON.parse(raw) as FreezeStore) : null;
    if (!parsed) return { days: {}, wallet: { month: '', used: 0, everUsed: 0 } };
    return {
      days: parsed.days ?? {},
      wallet: parsed.wallet ?? { month: '', used: 0, everUsed: 0 },
    };
  } catch {
    return { days: {}, wallet: { month: '', used: 0, everUsed: 0 } };
  }
}

export async function saveFreezeStore(store: FreezeStore): Promise<void> {
  try {
    await AsyncStorage.setItem(FREEZE_KEY, JSON.stringify(store));
  } catch {}
}

export function isFrozen(store: FreezeStore, habitId: string, date: string): boolean {
  return !!store.days[`${habitId}_${date}`];
}

export function frozenDatesForHabit(store: FreezeStore, habitId: string): Set<string> {
  const out = new Set<string>();
  Object.keys(store.days).forEach((key) => {
    if (key.startsWith(`${habitId}_`)) {
      out.add(key.slice(habitId.length + 1));
    }
  });
  return out;
}

/**
 * Uses one freeze token to cover a missed day. Tokens refresh monthly —
 * `GAME_RULES.freezeMaxPerMonth` per calendar month. When the free monthly
 * wallet is empty, shop-bought Freeze Tokens ❄️ (economy inventory) are spent
 * as overflow — bought tokens never replace a free credit. Returns false when
 * nothing is available or the day is already covered.
 */
export async function useFreezeForDate(habitId: string, date: string): Promise<boolean> {
  // serialized read-modify-write: concurrent closes (manual vs boot sweep)
  // used to read the same wallet snapshot and one freeze use was lost.
  return withLock(LOCK_KEYS.penalty, async () => {
    const store = await loadFreezeStore();
    if (isFrozen(store, habitId, date)) return false;

    const month = monthKeyOf(date);
    if (store.wallet.month !== month) {
      store.wallet = { month, used: 0, everUsed: store.wallet.everUsed };
    }
    // Monthly free credits (Aegis 'Deep Freeze' stretches the allowance).
    let allowance = GAME_RULES.freezeMaxPerMonth;
    try {
      const skill = await import('./skillService');
      allowance += (await skill.freezeAllowanceExtra()) || 0;
    } catch {}
    if (store.wallet.used < allowance) {
      store.wallet.used += 1;
      store.wallet.everUsed += 1;
      store.days[`${habitId}_${date}`] = new Date().toISOString();
      await saveFreezeStore(store);
      return true;
    }

    // Overflow: pay with a bought freeze token when the free credits ran out.
    try {
      const economy = await import('./economyService');
      if ((await economy.inventoryCount('freeze_token')) > 0 && (await economy.consumeInventory('freeze_token'))) {
        store.days[`${habitId}_${date}`] = new Date().toISOString();
        // Re-read + merge: consumeInventory wrote under the economy lock and
        // our snapshot is older — a blind save would erase that day token usage.
        const fresh = await loadFreezeStore();
        fresh.days[`${habitId}_${date}`] = new Date().toISOString();
        await saveFreezeStore(fresh);
        return true;
      }
    } catch {}
    return false;
  });
}

export async function freezeCreditsLeft(date: string): Promise<number> {
  const store = await loadFreezeStore();
  const month = monthKeyOf(date);
  const used = store.wallet.month === month ? store.wallet.used : 0;
  let allowance = GAME_RULES.freezeMaxPerMonth;
  try {
    const skill = await import('./skillService');
    allowance += (await skill.freezeAllowanceExtra()) || 0;
  } catch {}
  return Math.max(0, allowance - used);
}

export async function lifetimeFreezesUsed(): Promise<number> {
  const store = await loadFreezeStore();
  return store.wallet.everUsed;
}

/**
 * Consecutive credited "active" days for a habit, counting back from
 * `dateStr`. Frozen days (❄ covers) keep the chain alive without adding XP.
 * Inactive days (weekly off, n-day gap) never break the chain.
 *
 * IMPORTANT: pass CREDITED keys (`habitService.creditedDoneKeys`) — for
 * quantity habits any partial progress (count ≥ 1) keeps the streak alive.
 */
export function computeHabitStreak(
  habit: Habit,
  completedKeys: Set<string>,
  dateStr: string,
  frozenDays?: Set<string>
): number {
  const cursor = parseDate(dateStr);
  let streak = 0;
  for (let i = 0; i < 800; i++) {
    const iso = formatDate(cursor);
    if (isHabitActiveOnDate(habit, iso)) {
      const done = completedKeys.has(`${habit.id}_${iso}`);
      const frozen = frozenDays?.has(iso) ?? false;
      if (!done && !frozen) break;
      streak += 1;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Did the user complete every active habit of `dateStr`?
 * Quantity habits count as done with ANY progress (count ≥ 1) — partial
 * progress is a done day, never a fail. `completed` stays false until the
 * target, but the day is credited.
 * `excludeHabitId` skips one habit (e.g. the one being evaluated right now).
 */
export function isDayPerfect(
  habits: Habit[],
  completions: HabitCompletion[],
  dateStr: string,
  excludeHabitId?: string
): boolean {
  const active = habits.filter(
    (h) => !h.archived && h.id !== excludeHabitId && isHabitActiveOnDate(h, dateStr)
  );
  if (active.length === 0) return false;
  const doneIds = new Set(
    completions
      .filter((c) => c.date === dateStr && (c.completed || (c.count ?? 0) > 0))
      .map((c) => c.habitId)
  );
  return active.every((h) => doneIds.has(h.id));
}

/**
 * Total XP-context helper: how many consecutive days (ending yesterday)
 * were fully completed? Used for the perfect-week badge.
 */
export function computePerfectDayStreak(
  habits: Habit[],
  completions: HabitCompletion[],
  todayStr: string
): number {
  const doneByDate = new Map<string, string[]>();
  completions.forEach((c) => {
    // Credited rule — quantity habits with ANY progress are done days too.
    if (!c.completed && (c.count ?? 0) <= 0) return;
    const list = doneByDate.get(c.date) ?? [];
    list.push(c.habitId);
    doneByDate.set(c.date, list);
  });

  const cursor = parseDate(todayStr);
  cursor.setDate(cursor.getDate() - 1); // chain of FINISHED days — ends yesterday
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const iso = formatDate(cursor);
    const active = habits.filter((h) => !h.archived && isHabitActiveOnDate(h, iso));
    if (active.length === 0) {
      cursor.setDate(cursor.getDate() - 1);
      continue; // rest days don't break the perfect-chain
    }
    const done = new Set(doneByDate.get(iso) ?? []);
    if (!active.every((h) => done.has(h.id))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
