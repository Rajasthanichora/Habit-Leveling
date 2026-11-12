// ─── Season Clock 🗓️ (Phase 4D) ──────────────────────────────────────────────
//
// Offline, deterministic 30-day seasons anchored to the USER's first app open
// (personal anchor, persisted in the season store) — so a brand-new player
// starts at Season 1 / Day 1, never mid-calendar.
// Completion rate = completed scheduled days ÷ scheduled days inside the
// season window. Ends → one-time tier reward claim (`season_<id>`), processed
// lazily on the next app open. No notifications of its own; the statistics
// card surfaces it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SEASON } from './gameRules';
import { claimReward, emitGameEvent } from './gameBus';
import { formatDate, isHabitActiveOnDate, parseDate } from './recurrenceService';

const SEASON_KEY = '@habit_planner_season_v1';

export type SeasonTier = (typeof SEASON.tiers)[number]['key'];

/** A tier as the CURRENT USER sees it (level-gated + novice-leniency). */
export interface SeasonTierDef {
  key: SeasonTier;
  label: string;
  min: number;
  coins: number;
  xp: number;
  lv: number;
}

export interface SeasonPassMilestone {
  n: number;
  min: number;
  coins: number;
  xp: number;
  claimed: boolean;
  reached: boolean;
}

export interface SeasonProgress {
  id: number;
  startISO: string;
  endISO: string;
  dayInSeason: number;
  daysLeft: number;
  finished: boolean;
  scheduled: number;
  completed: number;
  rate: number;
  tier: { key: SeasonTier; label: string; coins: number; xp: number };
  nextTier?: { key: SeasonTier; label: string; min: number };
  /** Level-scaled payout preview (base tier × level multiplier × momentum). */
  payout: { coins: number; xp: number };
  /** Reward level of the user right now (drives scaling & gated tiers). */
  level: number;
  /** Back-to-back silver+ seasons multiplier (1 / 1.1 / 1.25). */
  momentum: number;
  /** Season Pass (battle-pass track): completions → milestones. */
  pass: {
    completed: number;
    level: number;
    next?: { n: number; min: number; coins: number; xp: number };
    claimable: SeasonPassMilestone[];
  };
}

export interface SeasonStore {
  version: 1;
  /** Local date (YYYY-MM-DD) the user's Season 1 / Day 1 started on. */
  anchorISO: string | null;
  processedSeasonId: number | null;
  history: { seasonId: number; tier: SeasonTier; coins: number; xp: number }[];
}

const EMPTY: SeasonStore = { version: 1, anchorISO: null, processedSeasonId: null, history: [] };

/** Internal season ids are 1-based relative to the user's personal anchor. */
function epochFor(anchorISO: string): Date {
  const [y, m, d] = anchorISO.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function seasonWindow(id: number, anchorISO: string): { startISO: string; endISO: string } {
  const start = new Date(epochFor(anchorISO).getTime());
  start.setDate(start.getDate() + (id - 1) * SEASON.lengthDays);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + SEASON.lengthDays - 1);
  return { startISO: formatDate(start), endISO: formatDate(end) };
}

export function seasonInfoFor(todayISO: string, anchorISO: string): { id: number; startISO: string; endISO: string; dayInSeason: number } {
  const today = parseDate(todayISO);
  const daysSince = Math.max(0, Math.floor((today.getTime() - epochFor(anchorISO).getTime()) / 86400000));
  const id = Math.floor(daysSince / SEASON.lengthDays) + 1;
  const win = seasonWindow(id, anchorISO);
  const dayInSeason =
    Math.floor((parseDate(todayISO).getTime() - parseDate(win.startISO).getTime()) / 86400000) + 1;
  return { id, ...win, dayInSeason };
}

function tierFor(rate: number, levels: SeasonTierDef[]): SeasonTierDef {
  let tier: SeasonTierDef = levels[0];
  for (const t of levels) {
    if (rate >= t.min) tier = t;
  }
  return tier;
}

// ─── Level-progressive tiers 🎚️ ──────────────────────────────────────────────

/**
 * The tier ladder a user of `level` sees. Lower tiers are always available;
 * Diamond unlocks at Lv 10 (with a gentler 0.7 gate below Lv 10) and Mythic
 * at Lv 25 — the season literally grows with the player.
 */
export function seasonTiersFor(level: number): SeasonTierDef[] {
  const out: SeasonTierDef[] = [];
  for (const t of SEASON.tiers) {
    if (level < t.lv) continue;
    const min = t.key === 'diamond' && level < 10 ? 0.7 : t.min;
    out.push({ key: t.key, label: t.label, min, coins: t.coins, xp: t.xp, lv: t.lv });
  }
  return out;
}

/** Level-scaled season payout: ×(1 + level×0.1), capped at ×4 (Lv 30+). */
export function levelRewardMult(level: number): number {
  return 1 + Math.min(level, 30) * 0.1;
}

// ─── Season momentum 🔥 (back-to-back seasons) ───────────────────────────────

/** Consecutive silver-or-better seasons at the tail of the history. */
function seasonStreakFromHistory(history: SeasonStore['history']): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = history[i].tier;
    if (t === 'silver' || t === 'gold' || t === 'diamond' || t === 'mythic') n += 1;
    else break;
  }
  return n;
}

/** 2+ strong seasons in a row → +10%; 5+ in a row → +25%. */
export function momentumMult(streak: number): number {
  return streak >= 5 ? 1.25 : streak >= 2 ? 1.1 : 1;
}

// ─── Season Pass 🎟️ (battle-pass track) ──────────────────────────────────────

export const PASS_STEP = 10;
export const PASS_MAX = 30;

function passMilestone(n: number): { n: number; min: number; coins: number; xp: number } {
  return { n, min: n * PASS_STEP, coins: 15 + n * 10, xp: n % 5 === 0 ? (n / 5) * 30 : 0 };
}

interface SeasonLikeHabit {
  id: string;
  archived?: boolean;
  startDate: string;
}

/** Rates an explicit [startISO … upToISO] window. Pure. */
export function computeWindowStats(
  habits: SeasonLikeHabit[],
  completions: { date: string; completed: boolean; habitId: string; count?: number }[],
  startISO: string,
  upToISO: string
): { scheduled: number; completed: number; rate: number } {
  const start = parseDate(startISO);
  const last = parseDate(upToISO);
  if (last < start) return { scheduled: 0, completed: 0, rate: 0 };

  let scheduled = 0;
  let completed = 0;
  const cursor = new Date(start.getTime());
  while (cursor <= last) {
    const iso = formatDate(cursor);
    const active = habits.filter((h) => !h.archived && isHabitActiveOnDate(h as any, iso));
    scheduled += active.length;
    const doneIds = new Set(
      // Credited rule — quantity habits with ANY progress (count ≥ 1) are done
      // days: partial progress counts toward the season rate like everywhere else.
      completions.filter((c) => c.date === iso && (c.completed || (c.count ?? 0) > 0)).map((c) => c.habitId)
    );
    completed += active.filter((h) => doneIds.has(h.id)).length;
    cursor.setDate(cursor.getDate() + 1);
  }
  return { scheduled, completed, rate: scheduled > 0 ? completed / scheduled : 0 };
}

export async function loadSeasonStore(): Promise<SeasonStore> {
  try {
    const raw = await AsyncStorage.getItem(SEASON_KEY);
    const parsed = raw ? (JSON.parse(raw) as SeasonStore) : null;
    return {
      version: 1,
      anchorISO: typeof parsed?.anchorISO === 'string' ? parsed.anchorISO : null,
      processedSeasonId: typeof parsed?.processedSeasonId === 'number' ? parsed.processedSeasonId : null,
      history: Array.isArray(parsed?.history) ? parsed!.history.slice(-12) : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * Resolves the user's personal Season 1 anchor. First run → today becomes
 * Day 1 of Season 1 and is persisted; later runs reuse it. Existing installs
 * without an anchor (old fixed-calendar store) also re-anchor to today so
 * numbering restarts from Season 1 — a one-time, intentional reset.
 */
async function resolveAnchor(store: SeasonStore): Promise<string> {
  if (store.anchorISO) return store.anchorISO;
  const anchor = formatDate(new Date());
  store.anchorISO = anchor;
  await saveSeasonStore(store);
  return anchor;
}

async function saveSeasonStore(store: SeasonStore): Promise<void> {
  try {
    await AsyncStorage.setItem(SEASON_KEY, JSON.stringify({ ...store, history: store.history.slice(-12) }));
  } catch {}
}

/** Current season view used by the Statistics card. */
export async function getSeasonProgress(
  habits: SeasonLikeHabit[],
  completions: { date: string; completed: boolean; habitId: string; count?: number }[]
): Promise<SeasonProgress> {
  const todayISO = formatDate(new Date());
  const store = await loadSeasonStore();
  const anchor = await resolveAnchor(store);
  const info = seasonInfoFor(todayISO, anchor);
  const stats = computeWindowStats(habits, completions, info.startISO, todayISO);
  const end = parseDate(info.endISO);
  const now = parseDate(todayISO);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));

  const level = await getUserLevel();
  const ladder = seasonTiersFor(level);
  const tier = tierFor(stats.rate, ladder);
  const next = ladder.find((t) => t.min > stats.rate);
  const momentum = momentumMult(seasonStreakFromHistory(store.history));
  const payout = {
    coins: Math.round(tier.coins * levelRewardMult(level) * momentum),
    xp: Math.round(tier.xp * levelRewardMult(level) * momentum),
  };

  // Season Pass — milestone states for the CURRENT season.
  const { isClaimed } = await import('./gameBus');
  const passClaimable: SeasonPassMilestone[] = [];
  let passNext: SeasonProgress['pass']['next'] | undefined;
  for (let n = 1; n <= PASS_MAX; n++) {
    const m = passMilestone(n);
    const reached = stats.completed >= m.min;
    const claimed = await isClaimed(`strack_${info.id}_${n}`);
    if (!claimed) {
      const mile: SeasonPassMilestone = { ...m, claimed, reached };
      if (reached) passClaimable.push(mile);
      else if (!passNext) passNext = m;
    }
  }

  return {
    id: info.id,
    startISO: info.startISO,
    endISO: info.endISO,
    dayInSeason: info.dayInSeason,
    daysLeft,
    finished: daysLeft === 0,
    scheduled: stats.scheduled,
    completed: stats.completed,
    rate: stats.rate,
    tier: { key: tier.key, label: tier.label, coins: tier.coins, xp: tier.xp },
    nextTier: next ? { key: next.key, label: next.label, min: next.min } : undefined,
    payout,
    level,
    momentum,
    pass: {
      completed: stats.completed,
      level: Math.min(PASS_MAX, Math.floor(stats.completed / PASS_STEP)),
      next: passNext,
      claimable: passClaimable,
    },
  };
}

async function getUserLevel(): Promise<number> {
  try {
    const xp = await import('./xpService');
    return xp.levelInfoFromTotal(await xp.loadTotalXp()).level;
  } catch {
    return 1;
  }
}

/**
 * Claims every REACHED, unclaimed Season Pass milestone of `id`, sequentially.
 * Returns totals granted (null when nothing was claimable).
 */
export async function claimSeasonPass(
  id: number,
  completed: number
): Promise<{ coins: number; xp: number; count: number } | null> {
  let coins = 0;
  let xp = 0;
  let count = 0;
  for (let n = 1; n <= PASS_MAX; n++) {
    const m = passMilestone(n);
    if (completed < m.min) break;
    if (!(await claimReward(`strack_${id}_${n}`, new Date().toISOString()))) continue;
    coins += m.coins;
    xp += m.xp;
    count += 1;
  }
  if (count === 0) return null;
  try {
    const economy = await import('./economyService');
    if (coins > 0) await economy.earnCoins(coins, '🎟️ Season Pass');
    if (xp > 0) {
      const xs = await import('./xpService');
      await xs.grantXpBonus(xp, `🎟️ Season Pass track`);
    }
    emitGameEvent({
      type: 'claim',
      message: `🎟️ Season Pass · ${count} milestone${count > 1 ? 's' : ''} (+${coins}🪙${xp > 0 ? ` +${xp} XP` : ''})`,
      xp,
    });
  } catch {}
  return { coins, xp, count };
}

interface SeasonLikeCompletion {
  date: string;
  completed: boolean;
  habitId: string;
  /** Partial quantity progress — ANY count ≥ 1 credits the day. */
  count?: number;
}

/**
 * Pays out every FINISHED season since the last processed one (usually one).
 * Called on app boot. Seasons still running are left open.
 */
export async function processSeasonRollover(
  habitsArg?: SeasonLikeHabit[],
  completionsArg?: SeasonLikeCompletion[]
): Promise<boolean> {
  try {
    const today = formatDate(new Date());
    const todayTime = parseDate(today).getTime();
    const store = await loadSeasonStore();
    const anchor = await resolveAnchor(store);

    let habits_ = habitsArg;
    let completions_ = completionsArg;
    if (!habits_ || !completions_) {
      const svc = await import('./habitService');
      [habits_, completions_] = await Promise.all([svc.loadHabits(), svc.loadCompletions()]) as any;
    }

    const lastProcessed = store.processedSeasonId ?? 0;
    let paid = false;
    let newestProcessed = lastProcessed;
    // Momentum streak carried from the tail of the history; updated per season.
    let streak = seasonStreakFromHistory(store.history);

    for (let guard = 0; guard < 40; guard++) {
      const id = newestProcessed + 1;
      const win = seasonWindow(id, anchor);
      if (parseDate(win.endISO).getTime() >= todayTime) break; // this one (or later) still running
      const claimed = await claimReward(`season_${id}`, new Date().toISOString());
      const stats = computeWindowStats(habits_!, completions_!, win.startISO, win.endISO);
      const level = await getUserLevel();
      const ladder = seasonTiersFor(level);
      const tier = tierFor(stats.rate, ladder);
      // [A] Season closed with real grind behind it → pay the tier ONCE,
      // scaled by user level, Chrono tree AND the back-to-back momentum
      // multiplier. A season with zero completions pays nothing — no
      // participation trophies.
      if (claimed && stats.scheduled > 0 && stats.completed > 0) {
        // Chrono tree + legend 'Calendar Keeper' family stretch tier payouts —
        // additive: c6 +15% · c12 +35% · l7 +10% · l8 +15% · l9 +20%.
        let seasonBoost = 1;
        try {
          const skill = await import('./skillService');
          seasonBoost = (await skill.seasonMult()) || 1;
        } catch {}
        const momentum = momentumMult(streak);
        const total = seasonBoost * levelRewardMult(level) * momentum;
        const coinsPaid = Math.round(tier.coins * total);
        const xpPaid = Math.round(tier.xp * total);
        const economy = await import('./economyService');
        if (coinsPaid > 0) await economy.earnCoins(coinsPaid, 'Season reward');
        if (xpPaid > 0) {
          const xp = await import('./xpService');
          await xp.grantXpBonus(xpPaid, `🗓️ Season ${id} reward`);
        }
        // 🎟️ Auto-claim any reached-but-unclaimed Season Pass milestones so a
        // closed season never strands them.
        let passPaid = { coins: 0, xp: 0, count: 0 };
        try {
          passPaid = (await claimSeasonPass(id, stats.completed)) ?? passPaid;
        } catch {}
        if (passPaid.coins > 0 || passPaid.xp > 0) {
          emitGameEvent({
            type: 'season',
            message: `🎟️ Season ${id} pass closed out — ${passPaid.count} milestone${passPaid.count > 1 ? 's' : ''} (+${passPaid.coins}🪙)`,
            tier: tier.label,
          });
        }
        streak += 1;
        store.history.push({ seasonId: id, tier: tier.key, coins: coinsPaid, xp: xpPaid });
        paid = true;
        // A closed season with a live tier may complete a legend counter.
        try {
          await (await import('./skillService')).checkLegendSkills();
        } catch {}
        const momentumTxt = momentum > 1 ? ` · 🔥 momentum ×${momentum}` : '';
        emitGameEvent({
          type: 'season',
          message: `🗓️ Season ${id} closed — ${tier.label} tier (+${coinsPaid}🪙 +${xpPaid} XP)${momentumTxt}`,
          tier: tier.label,
        });
        // 📬 Mailbox: season results deserve a keepsake letter.
        try {
          const mail = await import('./mailboxService');
          await mail.addMail({
            kind: 'season',
            icon: '🗓️',
            title: `Season ${id} closed — ${tier.label} tier`,
            body:
              `Completion rate paid out ${coinsPaid}🪙 and +${xpPaid} XP automatically` +
              (momentum > 1 ? ` (momentum ×${momentum} — ${streak} strong seasons in a row!)` : '') +
              (passPaid.count > 0 ? `, plus ${passPaid.count} Season Pass milestone${passPaid.count > 1 ? 's' : ''} (+${passPaid.coins}🪙)` : '') +
              `. A brand-new 30-day season is live — every completion keeps filling the tier bar.`,
          });
        } catch {}
      } else if (claimed) {
        // [B'] A claimed season with ZERO completions breaks the momentum chain.
        streak = 0;
      }
      // [B] Claim keyed even for empty seasons, so the pointer always advances.
      newestProcessed = id;
    }

    if (newestProcessed !== lastProcessed) {
      store.processedSeasonId = newestProcessed;
    }
    await saveSeasonStore(store);
    return paid;
  } catch {
    return false;
  }
}
