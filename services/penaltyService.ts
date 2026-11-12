// ─── Penalty engine: HP + fines + Close-the-Day ritual + Rebuild Missions ────
//
// penalty_v1 store + a small settings store. Rules:
//   • Penalties land ONLY on scheduled days — weekly offs & hourly gaps never
//     cost anything (freeze-aware logic reuse from the streak service).
//   • Defense chain per missed habit: Streak Shield 🛡️ → streak freeze ❄ →
//     HP damage −20 + coin fine −5. Skip Pass 🎫 waives a whole day.
//   • Rough-mood day halves fines. Insurance halves HP damage.
//   • Boss escape: extra fine + "Dragon escaped!" toast.
//   • Every damage/fine is claim-keyed `pen_<habitId>_<date>` — replay-safe.
//   • Close-the-Day is manual (merciful): nothing is punished before the
//     button is pressed (or the next-day sweep catches forgotten days).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENALTY_PRESETS, PenaltyIntensity } from './gameRules';
import { claimReward, emitGameEvent } from './gameBus';
import { formatDate, isHabitActiveOnDate, parseDate, todayStr } from './recurrenceService';
import { Habit, HabitCompletion } from './types';
import { withLock, LOCK_KEYS } from './writeLock';

const PEN_KEY = '@habit_planner_penalty_v1';
const PEN_SETTINGS_KEY = '@habit_planner_penalty_settings';

export const DEFAULT_PENALTY_SETTINGS = {
  intensity: 'balanced' as PenaltyIntensity,
  /** Level difficulty — the growth knob (default game is already hard). */
  difficulty: 'gentle' as 'gentle' | 'balanced' | 'hardcore',
  closeTime: '23:00',
  warnBeforeEnabled: true,
};

export type PenaltySettings = typeof DEFAULT_PENALTY_SETTINGS;

export async function loadPenaltySettings(): Promise<PenaltySettings> {
  try {
    const raw = await AsyncStorage.getItem(PEN_SETTINGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PenaltySettings>) : null;
    return {
      intensity: (parsed?.intensity ?? 'balanced') as PenaltyIntensity,
      difficulty: parsed?.difficulty ?? 'gentle',
      closeTime: parsed?.closeTime ?? '23:00',
      warnBeforeEnabled: parsed?.warnBeforeEnabled ?? true,
    };
  } catch {
    return { ...DEFAULT_PENALTY_SETTINGS };
  }
}

export async function savePenaltySettings(next: PenaltySettings): Promise<void> {
  try {
    await AsyncStorage.setItem(PEN_SETTINGS_KEY, JSON.stringify(next));
  } catch {}
}

export interface RebuildMission {
  habitId: string;
  habitName: string;
  startDate: string;
  completedDates: string[];
  /** 'active' | 'done' */
  status: 'active' | 'done';
}

export interface PenaltyStore {
  version: 1;
  lastClosedDate: string | null;
  missions: Record<string, RebuildMission>;
  closures: Record<string, CloseResult>;
}

const EMPTY: PenaltyStore = {
  version: 1,
  lastClosedDate: null,
  missions: {},
  closures: {},
};

export interface CloseResult {
  closedDate: string;
  coinsLost: number;
  hpLost: number;
  fineCount: number;
  protectedBy: { habitName: string; by: 'skip' | 'shield' | 'freeze' }[];
  hit: { habitName: string; fine: number; hpDamage: number; hpAfter: number; insured: boolean }[];
  escapedBossName: string | null;
  collapsedHabitNames: string[];
  phoenixSaves: string[];
  skipPassUsed: boolean;
  /** Rough-mood mercy halved the fines this day (empathy receipt line). */
  roughMoodHalf: boolean;
  executedAt: string;
}

export async function loadPenaltyStore(): Promise<PenaltyStore> {
  try {
    const raw = await AsyncStorage.getItem(PEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as PenaltyStore) : null;
    return {
      version: 1,
      lastClosedDate: typeof parsed?.lastClosedDate === 'string' ? parsed.lastClosedDate : null,
      missions: parsed?.missions ?? {},
      closures: parsed?.closures ?? {},
    };
  } catch {
    return { ...EMPTY };
  }
}

async function savePenaltyStore(store: PenaltyStore): Promise<void> {
  try {
    // Keep the closure ledger bounded.
    const dates = Object.keys(store.closures).sort();
    if (dates.length > 30) {
      for (const d of dates.slice(0, dates.length - 30)) delete store.closures[d];
    }
    await AsyncStorage.setItem(PEN_KEY, JSON.stringify(store));
  } catch {}
}

/**
 * Saves one closure against the LATEST on-disk snapshot, never a stale
 * in-memory copy. The penalty loop (and any concurrent caller) can write
 * rebuild missions while a close is running — persisting the stale snapshot
 * the caller started with would silently erase those missions.
 * Only the closure record + forward-only lastClosedDate are merged.
 */
async function persistClosureLedger(date: string, result: CloseResult): Promise<void> {
  try {
    await withLock(LOCK_KEYS.penalty, async () => {
      const fresh = await loadPenaltyStore();
      fresh.closures[date] = result;
      if (!fresh.lastClosedDate || fresh.lastClosedDate < date) fresh.lastClosedDate = date;
      await savePenaltyStore(fresh);
    });
  } catch {}
}

export async function getRebuildMissions(): Promise<RebuildMission[]> {
  const store = await loadPenaltyStore();
  return Object.values(store.missions).filter((m) => m.status === 'active');
}

export async function getRebuildForHabit(habitId: string): Promise<RebuildMission | undefined> {
  const store = await loadPenaltyStore();
  return store.missions[habitId];
}

/** Rebuild mission = N scheduled-day completions → free revive + coins. */
function rebuildMissionCoins(): number {
  return REBUILD_COINS; // scaled by the c10 multiplier at payout time
}
const REBUILD_DAYS_BASE = 3;
const REBUILD_COINS = 50;
const REBUILD_XP = 10;

// ─── Close-the-day core ──────────────────────────────────────────────────────

export interface PendingForClose {
  habit: Habit;
  done: boolean;
}

/** Pure: which scheduled habits of `date` are still pending. */
export function computePendingForDate(habits: Habit[], completions: HabitCompletion[], date: string): PendingForClose[] {
  // Quantity habits: ANY progress (count ≥ 1) credits the day — partial
  // progress is a done day, never a miss, so it can never be punished.
  const doneIds = new Set(
    completions.filter((c) => c.date === date && (c.completed || (c.count ?? 0) > 0)).map((c) => c.habitId)
  );
  return habits
    .filter((h) => !h.archived && isHabitActiveOnDate(h, date))
    .map((h) => ({ habit: h, done: doneIds.has(h.id) }));
}

/** Pure: did the user mark any completion 'rough' that day (grace rule)? */
export function isRoughMoodDay(completions: HabitCompletion[], date: string): boolean {
  return completions.some((c) => c.date === date && c.mood === 'rough');
}

export async function closeTheDay(date: string, opts?: { useSkipPass?: boolean; silent?: boolean; force?: boolean }): Promise<CloseResult | null> {
  try {
    // Future days are never punishable — a calendar peek ahead must not fine,
    // damage or collapse habits whose day hasn't even arrived. The auto-sweep
    // only ever calls this with dates ≤ yesterday, so this guard is purely
    // protective against the manual picker.
    if (date > todayStr()) return null;

    const settings = await loadPenaltySettings();
    const preset = PENALTY_PRESETS[settings.intensity];

    const blank: CloseResult = {
      closedDate: date,
      coinsLost: 0,
      hpLost: 0,
      fineCount: 0,
      protectedBy: [],
      hit: [],
      escapedBossName: null,
      collapsedHabitNames: [],
      phoenixSaves: [],
      skipPassUsed: false,
      roughMoodHalf: false,
      executedAt: new Date().toISOString(),
    };

    const store = await loadPenaltyStore();
    if (store.closures[date] && !opts?.force) return store.closures[date];

    const services = await import('./habitService');
    const [habits, completions] = await Promise.all([services.loadHabits(), services.loadCompletions()]);

    const pending = computePendingForDate(habits, completions, date);

    // Boss of the day (for the escape penalty).
    const quests = await import('./questsService');
    const boss = quests.pickBossFromHabits(habits, date);

    // Nothing scheduled → just advance the ledger, no claim, no noise.
    if (pending.length === 0) {
      await persistClosureLedger(date, blank);
      return blank;
    }

    // Zen mode ('off'): nothing is ever punished — no fines, no HP damage,
    // and no shield/freezes consumed either (previously shields were burned
    // against a strike that could never land).
    if (settings.intensity === 'off') {
      await persistClosureLedger(date, blank);
      return blank;
    }

    // ── Skip Pass gate (availability first) ──
    // Requesting a skip with ZERO passes held used to fall through to full
    // fines: the user pressed "use skip pass" and got punished anyway when
    // the last pass had already been burned by a concurrent close. Fail
    // BEFORE claiming so the close simply doesn't run — the sheet explains.
    const economy = await import('./economyService');
    if (opts?.useSkipPass && (await economy.inventoryCount('skip_pass')) < 1) {
      return null;
    }

    if (!(await claimReward(`close_${date}`, new Date().toISOString()))) {
      // Replay of an already-closed day — return the stored result.
      const stored = (await loadPenaltyStore()).closures[date];
      if (stored) return stored;
      // Crash recovery: the day was CLAIMED but its ledger write never made
      // it (process died between the claim and persistClosureLedger). Without
      // this the sweep returned blank forever, never advanced lastClosedDate
      // and retried the day on every pass. Record the closure now so the
      // claim and the ledger agree again.
      await persistClosureLedger(date, blank);
      return blank;
    }

    // ── Skip Pass: one pass waives the whole day's penalties ──
    let skipAll = false;
    if (opts?.useSkipPass) {
      skipAll = await economy.consumeInventory('skip_pass');
      // Razor-thin race (the last pass burned elsewhere between the
      // availability check and here): leave the day UNCLOSED rather than
      // punishing the user for a pass they no longer hold.
      if (!skipAll) return null;
    }

    // ── Rough-mood grace ──
    const roughHalf = isRoughMoodDay(completions, date) && !skipAll;

    // ── Skills scaling ──
    // The intensity preset is already baked into `preset.fine` / `preset.hpDamage`
    // (and into the Settings preview math), so the only remaining multipliers
    // are the skill tree's fine/HP knobs plus the rough-mood halving on fines.
    const skill = await import('./skillService');
    const roughScale = roughHalf ? await skill.roughFineMult() : 1.0;
    const fineScale = (await skill.fineMult()) * roughScale;
    const hpScale = await skill.hpDamageMult();

    const streak = await import('./streakService');
    const hpSvc = await import('./hpService');

    // Hoisted once for the whole loop — the old code re-loaded the economy
    // store (twice per habit), the inventory, the insurance map, the freeze
    // wallet AND the HP store for EVERY pending habit. With 15 habits that
    // was ~75 full AsyncStorage read-modify cycles per close; one snapshot
    // each (plus targeted consumes) does the same job.
    const econStore = await economy.loadEconomy();
    let titanLeft = Math.max(0, econStore.titanCharges ?? 0);
    let shieldLeft = await economy.inventoryCount('streak_shield');
    const insuranceMap = econStore.insurance ?? {};
    const hpMapAtClose = await hpSvc.getHpMap();

    let coinsLost = 0;
    let hpLost = 0;
    let fineCount = 0;
    const protectedBy: CloseResult['protectedBy'] = [];
    const hit: CloseResult['hit'] = [];
    const collapsed: string[] = [];
    const phoenixSaves: string[] = [];
    let escapedBoss: string | null = null;

    for (const { habit } of pending) {
      const hpState = hpMapAtClose[habit.id] ?? { hp: 100, reviveCount: 0 };
      if (hpState.collapsedAt) continue; // already hibernating — hibernating habits take no further damage

      // Layer 1: whole-day skip pass.
      if (skipAll) {
        protectedBy.push({ habitName: habit.name, by: 'skip' });
        continue;
      }
      // Layer 2: 🦾 Titan Shield charges (milestone tier — fires BEFORE the
      // regular shop shield) then the Streak Shield inventory. Counts are
      // tracked locally; consume() is only called while the snapshot says
      // stock remains, and a losing race just falls through to the fine.
      if (titanLeft > 0 && (await economy.consumeTitanCharge())) {
        titanLeft -= 1;
        protectedBy.push({ habitName: habit.name, by: 'shield' });
        continue;
      }
      if (shieldLeft > 0 && (await economy.consumeInventory('streak_shield'))) {
        shieldLeft -= 1;
        protectedBy.push({ habitName: habit.name, by: 'shield' });
        continue;
      }
      // Layer 3: streak freeze (monthly wallet / bought tokens).
      // A day that is ALREADY frozen is protected too — freezing it earlier
      // (e.g. via mood-repair) must block both the token burn AND the fine.
      // The freeze wallet is RE-READ at the moment of use: the hoisted
      // snapshot goes stale when a concurrent close (notification vs manual)
      // burns a freeze between the snapshot and this habit's turn, which
      // misreported protection either way.
      const freshFreezes = await streak.loadFreezeStore();
      if (streak.isFrozen(freshFreezes, habit.id, date) || (await streak.useFreezeForDate(habit.id, date))) {
        protectedBy.push({ habitName: habit.name, by: 'freeze' });
        continue;
      }
      // Layer 4: fines + HP damage. ('off' intensity never reaches here —
      // it early-returns above, so no implicit zero-check is needed.)
      // Insurance expiry straight off the hoisted snapshot.
      const insured = (insuranceMap[habit.id] ?? '') >= date;
      const fine = Math.round(preset.fine * fineScale * (insured ? 0.5 : 1));
      const hpDamage = Math.round(preset.hpDamage * hpScale * (insured ? 0.5 : 1));

      const claimed = await claimReward(`pen_${habit.id}_${date}`);
      if (!claimed) continue;

      if (fine > 0) {
        const actual = await economy.forceDrainCoins(fine, `Fine: ${habit.name}`);
        coinsLost += actual;
        fineCount += 1;
      }
      if (hpDamage > 0) {
        const dmg = await hpSvc.applyHpDamage(habit.id, habit.name, hpDamage);
        hpLost += dmg.lost;
        if (dmg.phoenixSave) phoenixSaves.push(habit.name);
        if (dmg.collapsed) {
          collapsed.push(habit.name);
          await createRebuildMission(habit.id, habit.name, date);
        }
      }
      hit.push({
        habitName: habit.name,
        fine,
        hpDamage,
        hpAfter: (await hpSvc.getHabitHp(habit.id)).hp,
        insured,
      });

      // Boss escape — narrative pressure.
      if (boss && boss.id === habit.id) {
        if (preset.bossFine > 0 && (await claimReward(`bossesc_${date}`))) {
          const drained = await economy.forceDrainCoins(preset.bossFine, 'Boss escaped 🐉');
          coinsLost += drained;
          escapedBoss = habit.name;
          if (!opts?.silent) {
            emitGameEvent({
              type: 'penalty',
              message: `🐉 Dragon escaped: ${habit.name}! −${drained}🪙`,
              coins: -drained,
            });
          }
        }
      }
    }

    const result: CloseResult = {
      closedDate: date,
      coinsLost,
      hpLost,
      fineCount,
      protectedBy,
      hit,
      escapedBossName: escapedBoss,
      collapsedHabitNames: collapsed,
      phoenixSaves,
      skipPassUsed: skipAll,
      roughMoodHalf: roughHalf,
      executedAt: new Date().toISOString(),
    };

    // Persist against the FRESHEST store — createRebuildMission() ran inside
    // the loop above and wrote missions straight to disk; saving our stale
    // `store` snapshot here would wipe them (free revive lost forever).
    await persistClosureLedger(date, result);

    // 📬 Mailbox: log the receipt so the player can revisit it tomorrow.
    try {
      const mail = await import('./mailboxService');
      const parts: string[] = [];
      if (result.skipPassUsed) parts.push('a Skip Pass 🎫 pardoned the whole day');
      if (result.protectedBy.length > 0) parts.push(`${result.protectedBy.length} habit${result.protectedBy.length !== 1 ? 's' : ''} protected by shields/freezes`);
      if (result.fineCount > 0) parts.push(`${result.fineCount} habit${result.fineCount !== 1 ? 's' : ''} fined ${result.coinsLost}🪙`);
      if (result.hpLost > 0) parts.push(`${result.hpLost} HP lost`);
      if (result.escapedBossName) parts.push(`the dragon escaped: ${result.escapedBossName}`);
      if (result.collapsedHabitNames.length > 0) parts.push(`collapsed: ${result.collapsedHabitNames.join(', ')}`);
      if (result.phoenixSaves.length > 0) parts.push(`Phoenix saved: ${result.phoenixSaves.join(', ')}`);
      await mail.addMail({
        kind: 'penalty',
        icon: result.coinsLost > 0 || result.hpLost > 0 ? '🌙' : '✨',
        title: result.coinsLost > 0 || result.hpLost > 0
          ? `Day closed — ${result.coinsLost}🪙 fines`
          : 'Day closed clean ✨',
        body: parts.length > 0
          ? `Receipt for ${date}:\n• ${parts.join('\n• ')}`
          : `Nothing was punished on ${date}. A clean ledger is a quiet flex.`,
      });
    } catch {}

    if (!opts?.silent) {
      const hadDamage = result.coinsLost > 0 || result.hpLost > 0 || result.fineCount > 0;
      emitGameEvent({
        type: 'penalty',
        message: hadDamage
          ? `🌙 Day closed — ${result.fineCount} habit${result.fineCount !== 1 ? 's' : ''} punished (−${result.coinsLost}🪙)`
          : '🌙 Day closed clean!',
      });
    }
    return result;
  } catch {
    return null;
  }
}

// ─── Sweep: punish forgotten past days (runs at app boot) ────────────────────

/**
 * Closes every scheduled day between (lastClosedDate+1) and yesterday.
 * Days with nothing scheduled are just skipped over. Returns the results
 * that actually contained penalties (for the aggregated boot toast).
 */
export async function sweepMissedDays(): Promise<CloseResult[]> {
  try {
    const today = todayStr();
    const yesterday = formatDate(new Date(parseDate(today).getTime() - 86400000));
    const store = await loadPenaltyStore();
    if (store.lastClosedDate && store.lastClosedDate >= yesterday) {
      return []; // caught up (lastClosed ≥ yesterday)
    }
    // Start the day AFTER the last closed one — starting one day before
    // (the old −1 offset) wasted sweep iterations on already-closed days.
    const startBase = store.lastClosedDate
      ? formatDate(new Date(parseDate(store.lastClosedDate).getTime() + 86400000))
      : formatDate(new Date(parseDate(today).getTime() - 3 * 86400000)); // never look back further than 3 days on first run
    if (startBase > yesterday) return [];

    const results: CloseResult[] = [];
    let cursor = parseDate(startBase);
    for (let i = 0; i < 10 && cursor <= parseDate(yesterday); i++) {
      const iso = formatDate(cursor);
      // closeTheDay persists its own ledger against the freshest on-disk
      // snapshot (persistClosureLedger), so no sweep-side save is needed —
      // saving the snapshot we started with would wipe closures/missions
      // that were written while the loop ran.
      const res = await closeTheDay(iso, { silent: i > 0 });
      if (res && (res.fineCount > 0 || res.hpLost > 0)) results.push(res);
      cursor.setDate(cursor.getDate() + 1);
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Rebuild Missions 🧱 (turning a collapse into progression) ────────────────

async function createRebuildMission(habitId: string, habitName: string, date: string): Promise<void> {
  await withLock(LOCK_KEYS.penalty, async () => {
    const store = await loadPenaltyStore();
    const existing = store.missions[habitId];
    if (existing && existing.status === 'active') return;
    store.missions[habitId] = {
      habitId,
      habitName,
      startDate: date,
      completedDates: [],
      status: 'active',
    };
    await savePenaltyStore(store);
  });
}

/**
 * Called from the XP pipeline on every completion. Fills the mission and
 * resolves it: free revive (when collapsed) + coins + XP. Idempotent.
 */
export async function progressRebuildMissions(habitId: string, habitName: string, date: string): Promise<void> {
  try {
    // Serialized: the XP pipeline (every completion) and the penalty loop
    // both progress missions against the whole shared store.
    await withLock(LOCK_KEYS.penalty, async () => {
    const store = await loadPenaltyStore();
    const mission = store.missions[habitId];
    if (!mission || mission.status !== 'active') return;
    if (mission.completedDates.includes(date)) return;
    if (date < mission.startDate) return;

    mission.completedDates.push(date);
    const skill = await import('./skillService');
    const daysRequired = ((await skill.rebuildDaysRequired()) || REBUILD_DAYS_BASE);
    const coinMult = ((await skill.rebuildCoinMult()) || 1);
    if (mission.completedDates.length >= daysRequired) {
      mission.status = 'done';
      mission.completedDates = [];
      mission.startDate = date; // archive marker
      await savePenaltyStore(store);

      const hp = await import('./hpService');
      const revived = await hp.reviveHabit(habitId, habitName, true);
      const economy = await import('./economyService');
      const payout = Math.round(rebuildMissionCoins() * coinMult);
      await economy.earnCoins(payout, 'Rebuild mission 🧱', { claimKey: `rebuild_${habitId}_${date}` });
      const xp = await import('./xpService');
      await xp.grantXpBonus(REBUILD_XP, '🧱 Rebuild complete');
      emitGameEvent({
        type: 'rebuild',
        habitName,
        message: `🧱 Rebuild mission done: ${habitName}${revived ? ' revived too!' : ` (+${payout}🪙)`}`,
      });
      return;
    }
    await savePenaltyStore(store);
    emitGameEvent({
      type: 'rebuild',
      habitName,
      message: `🧱 Rebuild progress: ${mission.completedDates.length}/${daysRequired} — ${habitName}`,
    });
    });
  } catch {}
}

/** Cleans up when a habit is deleted. */
export async function purgePenaltyData(habitId: string): Promise<void> {
  await withLock(LOCK_KEYS.penalty, async () => {
    const store = await loadPenaltyStore();
    if (store.missions[habitId]) {
      delete store.missions[habitId];
      await savePenaltyStore(store);
    }
  });
}
