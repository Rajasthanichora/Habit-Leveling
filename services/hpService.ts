// ─── Habit HP (Phase 4A "dark side" core mechanic) ────────────────────────────
//
// hp_v1 store. Rules:
//   • Max HP 100. Scheduled-day completion heals +10 (capped).
//   • Scheduled-day miss costs HP (scaled by the penalty intensity preset +
//     skill tree). HP floors at 0 — never negative.
//   • HP 0 → habit "collapses": hibernating state, streak effectively dies,
//     streak rewards pause. The habit is NEVER deleted (data stays safe).
//   • Revive: pay coins, or finish the 3-day rebuild quest (free).
//   • Phoenix (Aegis tree): survives the first collapse of every month at 25 HP.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { HP_RULES } from './gameRules';
import { claimReward, emitGameEvent } from './gameBus';
import { withLock, LOCK_KEYS } from './writeLock';

const HP_KEY = '@habit_planner_hp_v1';

export interface HabitHpState {
  hp: number;
  /** ISO timestamp of the collapse, when collapsed. */
  collapsedAt?: string;
  /** Lifetime revives (Phoenix Risen title scans this). */
  reviveCount: number;
  /** 'YYYY-MM' — marks Phoenix survival used this month. */
  phoenixMonthUsed?: string;
}

export interface HpStore {
  version: 1;
  everRevived: number;
  habits: Record<string, HabitHpState>;
}

const EMPTY_STATE: HabitHpState = { hp: HP_RULES.maxHp, reviveCount: 0 };

export async function loadHpStore(): Promise<HpStore> {
  try {
    const raw = await AsyncStorage.getItem(HP_KEY);
    const parsed = raw ? (JSON.parse(raw) as HpStore) : null;
    return {
      version: 1,
      everRevived: Math.max(0, Math.floor(parsed?.everRevived ?? 0)),
      habits: parsed?.habits ?? {},
    };
  } catch {
    return { version: 1, everRevived: 0, habits: {} };
  }
}

async function saveHpStore(store: HpStore): Promise<void> {
  try {
    await AsyncStorage.setItem(HP_KEY, JSON.stringify(store));
  } catch {}
}

function stateFor(store: HpStore, habitId: string): HabitHpState {
  const s = store.habits[habitId];
  if (!s) return { ...EMPTY_STATE };
  return {
    hp: Math.max(0, Math.min(HP_RULES.maxHp, Math.floor(s.hp ?? HP_RULES.maxHp))),
    collapsedAt: s.collapsedAt,
    reviveCount: Math.max(0, Math.floor(s.reviveCount ?? 0)),
    phoenixMonthUsed: s.phoenixMonthUsed,
  };
}

export async function getHabitHp(habitId: string): Promise<HabitHpState> {
  const store = await loadHpStore();
  return stateFor(store, habitId);
}

export async function getHpMap(): Promise<Record<string, HabitHpState>> {
  const store = await loadHpStore();
  const out: Record<string, HabitHpState> = {};
  Object.keys(store.habits).forEach((id) => {
    out[id] = stateFor(store, id);
  });
  return out;
}

export async function isCollapsed(habitId: string): Promise<boolean> {
  const store = await loadHpStore();
  return !!store.habits[habitId]?.collapsedAt;
}

// ─── Healing ──────────────────────────────────────────────────────────────────

/**
 * +10 HP for a completed scheduled day. Claim-keyed so toggling a
 * completion on/off repeatedly never stacks heals.
 */
export async function healOnCompletion(habitId: string, date: string): Promise<boolean> {
  const skill = await import('./skillService');
  const bonus = ((await skill.healBonus()) || 0);
  // Serialized: close-the-day damage for OTHER habits runs the same
  // whole-store read-modify-write concurrently — without the lock one
  // habit's heal/damage reverts when the other write lands.
  return withLock(LOCK_KEYS.hp, async () => {
    const store = await loadHpStore();
    const s = stateFor(store, habitId);
    if (s.hp >= HP_RULES.maxHp) return false; // full — nothing to heal
    // Claim AFTER the max-HP check: the old order burned the once-per-day
    // heal key on a full-HP completion, so a later close-of-day hit that
    // same day could never be healed back.
    if (!(await claimReward(`heal_${habitId}_${date}`))) return false;
    s.hp = Math.min(HP_RULES.maxHp, s.hp + HP_RULES.healPerCompletion + bonus);
    store.habits[habitId] = s;
    await saveHpStore(store);
    return true;
  });
}

// ─── Damage ──────────────────────────────────────────────────────────────────

export interface DamageResult {
  hp: number;
  /** HP actually lost (Phoenix may reduce damage by keeping HP alive). */
  lost: number;
  collapsed: boolean;
  /** True when the Phoenix skill saved the habit from collapsing. */
  phoenixSave: boolean;
}

/** Removes HP with a hard 0-floor. Emits `collapse` on the game bus. */
export async function applyHpDamage(habitId: string, habitName: string, amount: number): Promise<DamageResult> {
  // Serialized against heals and revives — see healOnCompletion.
  return withLock(LOCK_KEYS.hp, async () => {
    const store = await loadHpStore();
    const s = stateFor(store, habitId);
    const before = s.hp;
    let target = Math.max(0, before - Math.max(0, Math.round(amount)));
    let collapsed = false;
    let phoenixSave = false;

    if (target <= 0 && before > 0) {
      const skill = await import('./skillService');
      // Phoenix marks "once per month" with the LOCAL month (`YYYY-MM`) —
      // the former new Date().toISOString().slice(0, 7) read the UTC month,
      // so near month boundaries east/west of UTC the once-per-month save
      // charged the wrong month while the real one still read as unused.
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if ((await skill.hasPhoenix()) && s.phoenixMonthUsed !== month) {
        // Phoenix: survive at 25 HP, once per month.
        target = HP_RULES.phoenixHp;
        s.phoenixMonthUsed = month;
        phoenixSave = true;
        await saveHpStore({ ...store, habits: { ...store.habits, [habitId]: { ...s, hp: target, phoenixMonthUsed: month } } });
        return { hp: target, lost: before - target, collapsed: false, phoenixSave: true };
      }
    }

    if (target <= 0 && before > 0) {
      collapsed = true;
      s.collapsedAt = new Date().toISOString();
      emitGameEvent({ type: 'collapse', message: `🏚️ ${habitName} collapsed!`, habitName });
      // 📬 Mailbox: collapse warnings survive the toast.
      try {
        const mail = await import('./mailboxService');
        await mail.addMail({
          kind: 'collapse',
          icon: '🏚️',
          title: `${habitName} collapsed!`,
          body:
            'Its streak went silent and it is hibernating now. Options:\n' +
            '• Complete the habit — 3 days of the rebuild mission 🧱 revive it free\n' +
            '• Buy a Revival Kit 🩹 in the Shop (instant +50 HP)\n' +
            '• Pay coins in the habit menu to revive immediately\n' +
            'Collapsed habits lose nothing else — the data is safe.',
        });
      } catch {}
    } else if (target <= 0) {
      target = 0; // already collapsed — stay at 0 floor
    }

    s.hp = target;
    store.habits[habitId] = s;
    await saveHpStore(store);
    return { hp: s.hp, lost: Math.max(0, before - s.hp), collapsed, phoenixSave };
  });
}

// ─── Revival ─────────────────────────────────────────────────────────────────

/** Brings a collapsed habit back at 50 HP (+ Phoenix Rebirth skill bonus).
 *  Returns false when the habit is NOT collapsed — callers must check this
 *  BEFORE burning a Revival Kit, so a stale picker never wastes a purchase. */
export async function reviveHabit(habitId: string, habitName: string, viaFreeQuest = false): Promise<boolean> {
  return withLock(LOCK_KEYS.hp, async () => {
    const store = await loadHpStore();
    const s = stateFor(store, habitId);
    if (!s.collapsedAt) return false;
    delete s.collapsedAt;
    let heal = HP_RULES.reviveHp;
    try {
      const skill = await import('./skillService');
      heal += ((await skill.reviveHpBonus()) || 0);
    } catch {}
    s.hp = Math.min(HP_RULES.maxHp, heal);
    s.reviveCount += 1;
    store.habits[habitId] = s;
    store.everRevived += 1;
    await saveHpStore(store);
    emitGameEvent({
      type: 'revive',
      habitName,
      message: viaFreeQuest
        ? `🕊️ ${habitName} revived — rebuild quest complete! (+${s.hp} HP)`
        : `🕊️ ${habitName} revived! (+${s.hp} HP)`,
    });
    return true;
  });
}

/** Hard-set (UI/tests/Prestige safety): keeps values inside bounds. */
export async function ensureHabitHpEntry(habitId: string): Promise<void> {
  await withLock(LOCK_KEYS.hp, async () => {
    const store = await loadHpStore();
    if (!store.habits[habitId]) {
      store.habits[habitId] = { ...EMPTY_STATE };
      await saveHpStore(store);
    }
  });
}

/** Cleans up when a habit is deleted (data purge keeps stores orphan-free). */
export async function purgeHabitHp(habitId: string): Promise<void> {
  await withLock(LOCK_KEYS.hp, async () => {
    const store = await loadHpStore();
    if (store.habits[habitId]) {
      delete store.habits[habitId];
      await saveHpStore(store);
    }
  });
}
