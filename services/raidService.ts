// ─── Weekly Raid 🐉 — one shared challenge per ISO week ──────────────────────
//
// The whole week is the battle: every scheduled habit done across Mon–Sun
// fills the raid bar. Tiers are POSITIVE-ONLY (no fines, no damage — a raid
// rewards pushing harder, it never punishes an off week). One tier per week is
// claimable — the highest one reached. Claim-keyed (`raid_<week>_<tier>`) so
// replays and re-renders never double-pay.
//
// Reward philosophy (deliberately modest — this is bonus overlap on top of
// whatever the week already paid via quests/milestones). Phase 5 retune:
// thresholds climbed (35% / 60% / 90%) and items no longer drop — gold really
// means a near-perfect week. Payouts scale with the Chrono 'Raid Commander'
// skill.

import { Habit, HabitCompletion } from './types';
import { computePendingForDate } from './penaltyService';
import { formatDate, parseDate } from './recurrenceService';
import { grantXpBonus, loadTotalXp, levelInfoFromTotal } from './xpService';
import { emitGameEvent, claimReward, isClaimed } from './gameBus';

const RAID_STORE_KEY = '@habit_planner_raid_v1';

interface RaidStore {
  version: 1;
  /** Monday (ISO) of the last week a GOLD raid was cleared. */
  lastGoldMondayISO: string | null;
  /** Consecutive gold weeks (reset when a week ends without gold). */
  goldStreak: number;
}

const RAID_EMPTY: RaidStore = { version: 1, lastGoldMondayISO: null, goldStreak: 0 };

async function loadRaidStore(): Promise<RaidStore> {
  try {
    const raw = await (await import('@react-native-async-storage/async-storage')).default.getItem(RAID_STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as RaidStore) : null;
    return {
      version: 1,
      lastGoldMondayISO: typeof parsed?.lastGoldMondayISO === 'string' ? parsed.lastGoldMondayISO : null,
      goldStreak: typeof parsed?.goldStreak === 'number' ? parsed.goldStreak : 0,
    };
  } catch {
    return { ...RAID_EMPTY };
  }
}

async function saveRaidStore(store: RaidStore): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(RAID_STORE_KEY, JSON.stringify(store));
  } catch {}
}

export interface RaidTier {
  key: 'bronze' | 'silver' | 'gold';
  label: string;
  icon: string;
  /** Completion rate (0–1) required. */
  min: number;
  xp: number;
}

export const RAID_TIERS: RaidTier[] = [
  { key: 'bronze', label: 'Bronze Raid', icon: '🥉', min: 0.35, xp: 15 },
  { key: 'silver', label: 'Silver Raid', icon: '🥈', min: 0.6, xp: 45 },
  { key: 'gold', label: 'Gold Raid', icon: '🥇', min: 0.9, xp: 100 },
];

export interface RaidInfo {
  weekKey: string;
  /** Rate over the days that have already passed this week (0–1). */
  rate: number;
  done: number;
  scheduled: number;
  /** Days remaining in the week (including today, until it's closed). */
  daysLeft: number;
  isFinalDay: boolean;
  /** Highest tier the current rate qualifies for. */
  highestTier: RaidTier | null;
  /** Tier claimed so far this week (only the top one is claimable). */
  claimedTier: RaidTier | null;
  /** Level-scaled XP preview multiplier (skill × level × gold streak). */
  xpMult: number;
  /** Consecutive gold weeks so far (drives the 🔥 +15% multiplier at 3+). */
  goldStreak: number;
  /** True when the install-week grace trimmed pre-install days. */
  graced: boolean;
}

/** ISO-Monday-starting week id, e.g. `2026-W45`. */
export function raidWeekKey(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Monday-start: JS Sunday=0 → shift.
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day); // this week's Monday
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.floor(Math.round((d.getTime() - jan1.getTime()) / 86400000) / 7) + 1;
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Monday..'day' of `date`'s week as YYYY-MM-DD strings. */
function weekDatesThrough(date = new Date()): string[] {
  const now = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now.getTime() - day * 86400000);
  const out: string[] = [];
  for (let i = 0; i <= day; i++) {
    out.push(formatDate(new Date(monday.getTime() + i * 86400000)));
  }
  return out;
}

function tierForRate(rate: number): RaidTier | null {
  let best: RaidTier | null = null;
  for (const t of RAID_TIERS) {
    if (rate + 1e-9 >= t.min) best = t;
  }
  return best;
}

/** Level-scaled raid payout: ×(1 + level×0.08), capped at ×3.4 (Lv 30+). */
export function raidLevelMult(level: number): number {
  return 1 + Math.min(level, 30) * 0.08;
}

/** 3 consecutive gold weeks → +15% on the NEXT week's raid claims. */
export function raidStreakMult(goldStreak: number): number {
  return goldStreak >= 3 ? 1.15 : 1;
}

/**
 * Gold streak that still counts for the CURRENT week: the last gold must be
 * this week or the immediately previous one, otherwise the chain is broken.
 */
function effectiveGoldStreak(store: RaidStore): number {
  if (store.goldStreak <= 0 || !store.lastGoldMondayISO) return 0;
  const mondayISO = weekDatesThrough()[0];
  const mondayTime = parseDate(mondayISO).getTime();
  const lastISO = store.lastGoldMondayISO;
  if (lastISO === mondayISO) return store.goldStreak; // cleared earlier this week
  if (lastISO === formatDate(new Date(mondayTime - 7 * 86400000))) return store.goldStreak;
  return 0;
}

/** Live raid state for the current week (monday-start, past days only). */
export async function getRaidInfo(habits: Habit[], completions: HabitCompletion[]): Promise<RaidInfo> {
  const weekKey = raidWeekKey();
  const dates = weekDatesThrough();

  // Install-week grace 🛡️ — the week the app was first opened, pre-install
  // days (which were necessarily "missed") never count against the raid.
  let graced = false;
  try {
    const season = await import('./seasonService');
    const anchor = (await season.loadSeasonStore()).anchorISO;
    if (anchor && dates.length > 0 && anchor >= dates[0] && anchor <= dates[dates.length - 1]) {
      const idx = dates.indexOf(anchor);
      if (idx > 0) {
        dates.splice(0, idx);
        graced = true;
      }
    }
  } catch {}

  let scheduled = 0;
  let done = 0;
  for (const date of dates) {
    const pending = computePendingForDate(habits, completions, date);
    scheduled += pending.length;
    done += pending.filter((p) => p.done).length;
  }
  const rate = scheduled > 0 ? done / scheduled : 0;

  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const daysLeft = 7 - day;
  const isFinalDay = daysLeft <= 1;

  const highestTier = tierForRate(rate);
  let claimedTier: RaidTier | null = null;
  if (highestTier) {
    for (const t of RAID_TIERS) {
      const tIndex = RAID_TIERS.indexOf(t);
      if (tIndex > RAID_TIERS.indexOf(highestTier)) break;
      if (await isClaimed(`raid_${weekKey}_${t.key}`)) claimedTier = t;
    }
  }

  // 🔥 Gold streak + level — combined XP multiplier for the preview & claim.
  const store = await loadRaidStore();
  let level = 1;
  try {
    level = levelInfoFromTotal(await loadTotalXp()).level;
  } catch {}
  let skillMult = 1;
  try {
    const skill = await import('./skillService');
    skillMult = (await skill.raidXpMult()) || 1;
  } catch {}
  const streak = effectiveGoldStreak(store);
  const xpMult = skillMult * raidLevelMult(level) * raidStreakMult(streak);

  return {
    weekKey,
    rate: Math.min(1, Math.max(0, rate)),
    done,
    scheduled,
    daysLeft,
    isFinalDay,
    highestTier,
    claimedTier,
    xpMult,
    goldStreak: streak,
    graced,
  };
}

/**
 * Claims the highest tier not yet claimed this week (one tier per week — the
 * top one reached, never the lower ones). Returns fresh info. Safe to call
 * any time — no-op when nothing qualifies.
 */
export async function claimRaid(habits: Habit[], completions: HabitCompletion[]): Promise<{ info: RaidInfo; granted: RaidTier | null }> {
  const info = await getRaidInfo(habits, completions);
  const weekKey = info.weekKey;

  if (!info.highestTier) return { info, granted: null };

  // Walk from the highest tier down; claim the first tier that qualifies and
  // hasn't been claimed yet. Stops at the first already-claimed tier so an
  // earlier big week can never pay twice or grant two tiers.
  let granted: RaidTier | null = null;
  for (const t of [...RAID_TIERS].reverse()) {
    if (RAID_TIERS.indexOf(t) > RAID_TIERS.indexOf(info.highestTier)) continue;
    if (await isClaimed(`raid_${weekKey}_${t.key}`)) break;
    if (!(await claimReward(`raid_${weekKey}_${t.key}`))) break;
    granted = t;
    // 💪 Level + 🔥 gold-streak scaling on top of the skill multiplier.
    let level = 1;
    try {
      level = levelInfoFromTotal(await loadTotalXp()).level;
    } catch {}
    let skillMult = 1;
    try {
      const skill = await import('./skillService');
      skillMult = (await skill.raidXpMult()) || 1;
    } catch {}
    const store = await loadRaidStore();
    const streakMult = raidStreakMult(effectiveGoldStreak(store));
    const boosted = Math.round(t.xp * skillMult * raidLevelMult(level) * streakMult);
    const xpGain = await grantXpBonus(boosted, `${t.icon} ${t.label} cleared!`);
    // 🔥 Fire Bounty (l2): a flat coin bounty on every single raid clear,
    // scaled the same way.
    try {
      const [economy, bounty] = await Promise.all([
        import('./economyService'),
        (await import('./skillService')).raidBountyCoins(),
      ]);
      if (bounty > 0) {
        await economy.earnCoins(Math.round(bounty * raidLevelMult(level) * streakMult), `${t.icon} Fire Bounty coins`);
      }
    } catch {}
    // 📈 Gold streak bookkeeping — consecutive gold weeks feed the +15% mult.
    try {
      if (t.key === 'gold') {
        const mondayISO = weekDatesThrough()[0];
        const prevMondayISO = formatDate(new Date(parseDate(mondayISO).getTime() - 7 * 86400000));
        const nextStreak = store.lastGoldMondayISO === prevMondayISO ? store.goldStreak + 1 : 1;
        await saveRaidStore({ version: 1, lastGoldMondayISO: mondayISO, goldStreak: nextStreak });
      }
    } catch {}
    const streakTxt = streakMult > 1 ? ' · 🔥 streak ×1.15' : '';
    emitGameEvent({
      type: 'claim',
      message: `${t.icon} ${t.label} cleared! +${xpGain.total} XP${streakTxt}`,
      xp: xpGain.total,
    });
    break;
  }

  // A fresh claim may complete a legend counter (raidAny / raidGold).
  try {
    await (await import('./skillService')).checkLegendSkills();
  } catch {}

  return { info: { ...info, claimedTier: granted ?? info.claimedTier }, granted };
}
