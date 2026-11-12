// ─── Skill trees, Skill Points & equipable titles (Phase 5 rework) ──────────
//
// skills_v2 store. Every multiplier the rest of the game reads lives here:
// coinMult(), xpMult(), fineMult(), hpDamageMult(), etc. Nodes require their
// parent — a locked layer means no buy — AND a player level (minLevel gate).
// With 12 nodes per tree (~32 SP each) trees are endgame content: only a
// handful of nodes are realistically reachable in a normal run.
//
// Migration v1 → v2: skill ids were re-scoped when the chest system died;
// every owned id that no longer exists in SKILL_TREES is refunded to SP so a
// migration never destroys purchased power. Titles are unlocked from real
// progress and never revoked once per user design.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EQUIPPABLE_TITLES,
  SKILL_TREES,
  LEGEND_SKILLS,
  SkillNodeId,
  isLegendNodeId,
} from './gameRules';
import type { LegendNodeDef, TitleDef } from './gameRules';
import { emitGameEvent, loadClaims } from './gameBus';
import { scaledWins } from './difficultyService';
import { withLock, LOCK_KEYS } from './writeLock';

const SKILLS_KEY = '@habit_planner_skills_v2';
/** Old v1 store — read once for the SP-faithful migration, never written. */
const SKILLS_V1_KEY = '@habit_planner_skills_v1';

export interface SkillStore {
  version: 2;
  sp: number;
  owned: SkillNodeId[];
  equippedTitle: string | null;
  spEarnedLifetime: number;
}

const EMPTY: SkillStore = { version: 2, sp: 0, owned: [], equippedTitle: null, spEarnedLifetime: 0 };

/** Every id any store may legitimately carry (bought trees + earned legend). */
const VALID_IDS = new Set<string>([
  ...SKILL_TREES.flatMap((t) => t.nodes.map((n) => n.id as string)),
  ...LEGEND_SKILLS.map((n) => n.id as string),
]);

let migratedThisRun = false;

async function migrateV1(): Promise<Partial<SkillStore> | null> {
  try {
    const raw = await AsyncStorage.getItem(SKILLS_V1_KEY);
    if (!raw) return null;
    const v1 = JSON.parse(raw) as { sp?: number; owned?: string[]; equippedTitle?: string | null; spEarnedLifetime?: number };
    const owned = (v1.owned ?? []).filter((n): n is SkillNodeId => typeof n === 'string' && VALID_IDS.has(n));
    // Every skill that died with the chest economy returns its SP.
    const staleCount = (v1.owned ?? []).length - owned.length;
    return {
      version: 2,
      sp: Math.max(0, Math.floor(v1.sp ?? 0)) + Math.max(0, staleCount),
      owned,
      equippedTitle: typeof v1.equippedTitle === 'string' ? v1.equippedTitle : null,
      spEarnedLifetime: Math.max(0, Math.floor(v1.spEarnedLifetime ?? 0)) + Math.max(0, staleCount),
    };
  } catch {
    return null;
  }
}

async function normalize(raw: Partial<SkillStore> | null): Promise<SkillStore> {
  const out: SkillStore = {
    version: 2,
    sp: Math.max(0, Math.floor(raw?.sp ?? 0)),
    owned: Array.isArray(raw?.owned) ? raw!.owned.filter((n): n is SkillNodeId => typeof n === 'string') : [],
    equippedTitle: typeof raw?.equippedTitle === 'string' ? raw!.equippedTitle : null,
    spEarnedLifetime: Math.max(0, Math.floor(raw?.spEarnedLifetime ?? 0)),
  };
  // Guard-rail: drop any id the current tree map no longer knows (no refund
  // here — that door only opens once, in the v1 branch above; re-marking
  // against schema drift is a safety net for dev edits). Legend ids stay —
  // they are earned proof, not purchases.
  const owned = out.owned.filter((n) => VALID_IDS.has(n));
  if (owned.length !== out.owned.length) {
    out.sp += out.owned.length - owned.length;
    out.owned = owned;
  }
  return out;
}

export async function loadSkillStore(): Promise<SkillStore> {
  try {
    if (!migratedThisRun) {
      migratedThisRun = true;
      const already = await AsyncStorage.getItem(SKILLS_KEY);
      if (!already) {
        // First boot after the v2 schema → run the refund-migration.
        const v1 = await migrateV1();
        if (v1) {
          const migrated = await normalize(v1);
          await AsyncStorage.setItem(SKILLS_KEY, JSON.stringify(migrated));
          return migrated;
        }
      }
    }
    const raw = await AsyncStorage.getItem(SKILLS_KEY);
    return raw ? await normalize(JSON.parse(raw)) : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

async function saveSkillStore(store: SkillStore): Promise<void> {
  try {
    await AsyncStorage.setItem(SKILLS_KEY, JSON.stringify(store));
  } catch {}
}

// ─── SP economy ───────────────────────────────────────────────────────────────

/** Levels pay Skill Points. Called from the XP level-up pipeline.
 *  Serialized: a level-up landing in the same tick as a node purchase or
 *  respec otherwise writes whole stale stores over each other — the granted
 *  SP or the bought node silently vanishes. */
export async function grantSp(amount: number): Promise<void> {
  if (amount <= 0) return;
  await withLock(LOCK_KEYS.skills, async () => {
    const store = await loadSkillStore();
    store.sp += amount;
    store.spEarnedLifetime += amount;
    await saveSkillStore(store);
  });
}

export function nodeById(id: SkillNodeId) {
  return SKILL_TREES.flatMap((t) => t.nodes).find((n) => n.id === id);
}

export function isOwned(store: SkillStore, id: SkillNodeId): boolean {
  return store.owned.includes(id);
}

/**
 * Can only buy when parent owned + enough SP + player level reached
 * (deep-tier gates) + not already owned. `level` is optional so the shop UI
 * can reuse this for plain nodes; minLevel-gated nodes require it.
 */
export function canBuy(store: SkillStore, id: SkillNodeId, level?: number): boolean {
  const node = nodeById(id);
  if (!node || isOwned(store, id)) return false;
  if (node.parent && !isOwned(store, node.parent)) return false;
  if (node.minLevel != null && (level == null || level < node.minLevel)) return false;
  return store.sp >= node.cost;
}

export async function buySkillNode(id: SkillNodeId): Promise<boolean> {
  // Serialized so a concurrent grantSp (level-up) or respec can't clobber the
  // purchase — or let a double-tap spend SP twice.
  const ok = await withLock(LOCK_KEYS.skills, async () => {
    const store = await loadSkillStore();
    const node = nodeById(id);
    if (!node) return false;
    // Level gate enforced on the purchase too, not only in the UI.
    let level = 0;
    try {
      const xp = await import('./xpService');
      level = xp.levelInfoFromTotal((await xp.loadXp()).totalXp).level;
    } catch {}
    if (!canBuy(store, id, level)) return false;
    store.sp -= node.cost;
    store.owned.push(id);
    await saveSkillStore(store);
    return true;
  });
  if (!ok) return false;
  const node = nodeById(id);
  emitGameEvent({ type: 'skill', message: `🧠 Skill unlocked: ${node?.name ?? id}` });
  return true;
}

/**
 * respec 🔁 — wipe every owned node and refund the full node costs as SP.
 * Costs 150 coins (lifetime progression stays yours: SP only moves from
 * nodes back to the wallet, titles stay equipped).
 */
export async function resetSkills(): Promise<boolean> {
  const respecRefund = await withLock(LOCK_KEYS.skills, async () => {
    const store = await loadSkillStore();
    if (store.owned.length === 0) return null;
    const economy = await import('./economyService');
    const RESPEC_COST = 150;
    // Drain first — if the player can't pay, nothing changes.
    const drained = await economy.forceDrainCoins(RESPEC_COST, 'Skill respec 🔁');
    if (drained < RESPEC_COST) {
      if (drained > 0) {
        // Refund whatever actually left the wallet (shouldn't happen — the UI
        // only shows the button when coins >= 150, but stay safe).
        await economy.earnCoins(drained, 'Skill respec refund', { silent: true });
      }
      return null;
    }
    const refund = SKILL_TREES.flatMap((t) => t.nodes)
      .filter((n) => store.owned.includes(n.id))
      .reduce((sum, n) => sum + n.cost, 0);
    // Legend skills (l1–l9) are earned proof, never purchases — a respec wipes
    // only bought tree nodes and refunds only their SP.
    store.owned = store.owned.filter(isLegendNodeId);
    store.sp += refund;
    await saveSkillStore(store);
    return refund;
  });
  if (respecRefund === null) return false;
  emitGameEvent({ type: 'skill', message: `🔁 Skill respec — ${respecRefund} SP refunded` });
  return true;
}

export async function equipTitle(titleId: string | null): Promise<void> {
  await withLock(LOCK_KEYS.skills, async () => {
    const store = await loadSkillStore();
    store.equippedTitle = titleId;
    await saveSkillStore(store);
  });
}

// ─── Multipliers read by the whole economy ───────────────────────────────────
//
// v3 NERF: the SP-tree nodes you buy through repeating daily discipline are
// deliberately weaker than before — the heavy power now lives in the LEGEND
// skills that are EARNED in the arena (raids / challenges / seasons). Every
// place legend skills contribute is marked.

async function has(id: SkillNodeId): Promise<boolean> {
  return (await loadSkillStore()).owned.includes(id);
}

/** % multiplier from coin-percentage nodes (h1 + h4 + h9 + h10 + h11 + h12). */
export async function coinMult(): Promise<number> {
  let m = 1;
  if (await has('h1')) m += 0.07;
  if (await has('h4')) m += 0.13;
  if (await has('h9')) m += 0.08;   // Baron of Wins
  if (await has('h10')) m += 0.16;
  if (await has('h11')) m += 0.10;  // Empire Builder
  if (await has('h12')) m += 0.16;
  return m;
}

/** Flat coins added on every completed habit (h2 + h8). */
export async function coinFlat(): Promise<number> {
  return (await has('h2') ? 1 : 0) + (await has('h8') ? 2 : 0);
}

/** % multiplier from XP-percentage nodes (s1 + s4 + s10 + s12). */
export async function xpMult(): Promise<number> {
  let m = 1;
  if (await has('s1')) m += 0.07;
  if (await has('s4')) m += 0.10;
  if (await has('s10')) m += 0.10;
  if (await has('s12')) m += 0.10;
  return m;
}

export async function milestoneXpMult(): Promise<number> {
  return (await has('s2')) ? 1.5 : 1;
}

export async function fineMult(): Promise<number> {
  let m = 1;
  if (await has('a1')) m -= 0.12;
  if (await has('a3')) m -= 0.18;
  if (await has('a12')) m -= 0.12;
  return Math.max(0, m);
}

export async function hpDamageMult(): Promise<number> {
  // Iron Resolve ×0.85 · Second Wind ×0.94 · Second Skin ×0.94.
  let m = 1;
  if (await has('a2')) m *= 0.85;
  if (await has('a6')) m *= 0.94;
  if (await has('a11')) m *= 0.94;
  return m;
}

export async function comboWindowMinutes(): Promise<number> {
  // Midas 'Combo Maestro' +30, Chrono 'Long Chain' +20, 'Chain Architect' +30.
  const [h3, c2, c11] = await Promise.all([has('h3'), has('c2'), has('c11')]);
  let m = 40 + (c2 ? 20 : 0) + (c11 ? 30 : 0);
  if (h3) m += 30;
  return m;
}

/** Daily-quest reward multiplier (c1 + c7). */
export async function questXpMult(): Promise<number> {
  let m = 1;
  if (await has('c1')) m += 0.15;
  if (await has('c7')) m += 0.15;
  return m;
}

/** Collapsed-habit revival price discount (Chrono 'Time Healer' −15%). */
export async function revivePriceMult(): Promise<number> {
  return (await has('c4')) ? 0.85 : 1;
}

/** Mood-bonus flat extension (s3 + s9 — one extra +1 XP each). */
export async function moodBonusFlat(): Promise<number> {
  return (await has('s3') ? 1 : 0) + (await has('s9') ? 1 : 0);
}

export async function hasPhoenix(): Promise<boolean> {
  return has('a4');
}

/** Extra HP healed per completion (a5). */
export async function healBonus(): Promise<number> {
  return (await has('a5')) ? 2 : 0;
}

/** Insurance certificate extends by N days (a7). */
export async function insuranceDaysExtra(): Promise<number> {
  return (await has('a7')) ? 3 : 0;
}

/** Revival heals N HP more (a9). */
export async function reviveHpBonus(): Promise<number> {
  return (await has('a9')) ? 10 : 0;
}

/** Extra free monthly freeze allowance (a8 + legend 'Streak Anchor' l5). */
export async function freezeAllowanceExtra(): Promise<number> {
  const [a8, l5] = await Promise.all([has('a8'), has('l5')]);
  return (a8 ? 1 : 0) + (l5 ? 1 : 0);
}

/** Boss-day bonus XP multiplier (c5 +30%). */
export async function bossXpMult(): Promise<number> {
  return (await has('c5')) ? 1.3 : 1;
}

/** Perfect-day bonus XP bonus (c8 +0.25, s11 +0.3 → additive stack). */
export async function perfectXpMult(): Promise<number> {
  let m = 1;
  if (await has('c8')) m += 0.25;
  if (await has('s11')) m += 0.30;
  return m;
}

/**
 * Season tier reward multiplier (additive): Chrono c6 +15% & c12 +35%,
 * legend Calendar Keeper l7 +10%, Era Sovereign l8 +15%, Master of Eras l9 +20%.
 */
export async function seasonMult(): Promise<number> {
  const [c6, c12, l7, l8, l9] = await Promise.all([has('c6'), has('c12'), has('l7'), has('l8'), has('l9')]);
  let m = 1;
  if (c6) m += 0.15;
  if (c12) m += 0.35;
  if (l7) m += 0.10;
  if (l8) m += 0.15;
  if (l9) m += 0.20;
  return m;
}

/**
 * Weekly raid payout multiplier (additive): Chrono 'Raid Commander' +25%,
 * legend 'Dragon Tamer' l1 +25%, legend 'Warlord' l3 +50%.
 */
export async function raidXpMult(): Promise<number> {
  const [c3, l1, l3] = await Promise.all([has('c3'), has('l1'), has('l3')]);
  let m = 1;
  if (c3) m += 0.25;
  if (l1) m += 0.25;
  if (l3) m += 0.50;
  return m;
}

/** Flat coin bounty paid on every raid clear (legend 'Fire Bounty' l2). */
export async function raidBountyCoins(): Promise<number> {
  return (await has('l2')) ? 20 : 0;
}

/** 7-day challenge reward multiplier (legend Momentum Seal +50%, Titan +50%). */
export async function challengeRewardMult(): Promise<number> {
  const [l4, l6] = await Promise.all([has('l4'), has('l6')]);
  let m = 1;
  if (l4) m += 0.50;
  if (l6) m += 0.50;
  return m;
}

/** Rebuild mission coins ×1.25 (c10). */
export async function rebuildCoinMult(): Promise<number> {
  return (await has('c10')) ? 1.25 : 1;
}

/** Rebuild missions complete in 2 days instead of 3 (c9). */
export async function rebuildDaysRequired(): Promise<number> {
  return (await has('c9')) ? 2 : 3;
}

/** Completion-XP streak bonus cap in days (s8: 50 → 65). */
export async function streakXpCap(): Promise<number> {
  return (await has('s8')) ? 65 : 50;
}

/** Coin streak-bonus cap in days (h5: 30 → 40). */
export async function streakBonusCapDays(): Promise<number> {
  return (await has('h5')) ? 40 : 30;
}

/** Coin streak-bonus % per day (h7: 1% → 1.25%). */
export async function streakBonusPerDayRate(): Promise<number> {
  return (await has('h7')) ? 0.0125 : 0.01;
}

/** Quantity-drip XP cap in units (s5: 4 → 6). */
export async function dripCap(): Promise<number> {
  return (await has('s5')) ? 6 : 4;
}

/** Full-checklist bonus multiplier (s6 ×1.5). */
export async function subHabitXpMult(): Promise<number> {
  return (await has('s6')) ? 1.5 : 1;
}

/** Shop price multiplier (h6: −7%). */
export async function priceMult(): Promise<number> {
  return (await has('h6')) ? 0.93 : 1;
}

/** Perfect-day streak mercy: rough-mood fines drop to one third (a10). */
export async function roughFineMult(): Promise<number> {
  return (await has('a10')) ? 0.35 : 0.5;
}

/** XP Storm extends its window by N hours when bought (s7). */
export async function xpStormHoursExtra(): Promise<number> {
  return (await has('s7')) ? 8 : 0;
}

export async function treeCompleted(treeId: 'hustler' | 'sage' | 'aegis' | 'chrono'): Promise<boolean> {
  const s = await loadSkillStore();
  const tree = SKILL_TREES.find((t) => t.id === treeId);
  return !!tree && tree.nodes.every((n) => s.owned.includes(n.id));
}

// ─── Legend skills 🐉 (earned in the arena, never bought) ────────────────────
//
// Counters are DISTINCT ledgers, not repeated completions:
//   • raidAny    → every `raid_*` claim key ever granted (raid claim idempotency)
//   • raidGold   → only `*_gold` raid tier claims (harder clear)
//   • challenge  → the 7-day challenge history ledger (`loadChallenge().history`)
//   • season     → closed season history at ANY tier (paid tiers only are
//                  recorded; zero-completion seasons never count)
// Every node also demands the player level and scales `wins` with the
// difficulty preset — a title earned on Hardcore means more.

export interface LegendCounters {
  raidAny: number;
  raidGold: number;
  challenge: number;
  season: number;
}

async function legendCounts(): Promise<LegendCounters> {
  const claims = await loadClaims();
  let raidAny = 0;
  let raidGold = 0;
  for (const key of Object.keys(claims)) {
    if (key.startsWith('raid_')) {
      raidAny += 1;
      if (key.endsWith('_gold')) raidGold += 1;
    }
  }
  let challenge = 0;
  let season = 0;
  try {
    const challengeModule = await import('./challengeService');
    challenge = (await challengeModule.loadChallenge()).history.length;
  } catch {}
  try {
    const seasonModule = await import('./seasonService');
    season = (await seasonModule.loadSeasonStore()).history.length;
  } catch {}
  return { raidAny, raidGold, challenge, season };
}

export async function currentLevel(): Promise<number> {
  try {
    const xp = await import('./xpService');
    return xp.levelInfoFromTotal((await xp.loadXp()).totalXp).level;
  } catch {
    return 0;
  }
}

/** Live per-node progress for the Skills screen ("2 / 2 raids cleared 🐉"). */
export async function legendProgress(): Promise<{
  level: number;
  nodes: Record<string, { current: number; target: number; levelOk: boolean; owned: boolean }>;
}> {
  const [counts, level, store] = await Promise.all([legendCounts(), currentLevel(), loadSkillStore()]);
  const nodes: Record<string, { current: number; target: number; levelOk: boolean; owned: boolean }> = {};
  for (const def of LEGEND_SKILLS) {
    const current = counts[def.stat] ?? 0;
    nodes[def.id] = {
      current,
      target: scaledWins(def.wins),
      levelOk: level >= def.minLevel,
      owned: store.owned.includes(def.id),
    };
  }
  return { level, nodes };
}

/**
 * The one engine that grants legend skills. Called after every raid claim,
 * challenge win, season payout AND at app boot — fully idempotent (a node
 * already in `owned` is skipped).
 */
export async function checkLegendSkills(): Promise<LegendNodeDef[]> {
  // Serialized: raid/challenge/season pipelines (and boot) all invoke this —
  // unlocked concurrent calls wrote stale stores over each other and could
  // drop a just-earned legend skill.
  return withLock(LOCK_KEYS.skills, async () => {
    const [counts, level, store] = await Promise.all([legendCounts(), currentLevel(), loadSkillStore()]);
    const fresh: LegendNodeDef[] = [];
    for (const def of LEGEND_SKILLS) {
      if (store.owned.includes(def.id)) continue;
      if (level < def.minLevel) continue;
      if ((counts[def.stat] ?? 0) < scaledWins(def.wins)) continue;
      store.owned.push(def.id);
      fresh.push(def);
    }
    if (fresh.length > 0) {
      await saveSkillStore(store);
    }
    for (const def of fresh) {
      emitGameEvent({ type: 'skill', message: `${def.icon} Legend unlocked: ${def.name}` });
    }
    return fresh;
  });
}

// ─── Titles ──────────────────────────────────────────────────────────────────

/** Every raid claim key ever granted — `boss_` wins (not `bossesc_` counters). */
async function raidlessBossWins(): Promise<number> {
  try {
    const claims = await loadClaims();
    return Object.keys(claims).filter((k) => k.startsWith('boss_') && !k.startsWith('bossesc_')).length;
  } catch {
    return 0;
  }
}

/** Best streak across all non-archived habits (today anchor). */
async function bestHabitStreak(): Promise<number> {
  try {
    const habitModule = await import('./habitService');
    const [habitList, comps] = await Promise.all([habitModule.loadHabits(), habitModule.loadCompletions()]);
    const streakModule = await import('./streakService');
    const recurrenceModule = await import('./recurrenceService');
    const freezeStore = await streakModule.loadFreezeStore();
    const doneKeys = new Set(comps.filter((c) => c.completed || (c.count ?? 0) > 0).map((c) => c.key));
    const today = recurrenceModule.formatDate(new Date());
    let best = 0;
    for (const habit of habitList) {
      if (habit.archived) continue;
      const streak = streakModule.computeHabitStreak(
        habit,
        doneKeys,
        today,
        streakModule.frozenDatesForHabit(freezeStore, habit.id)
      );
      if (streak > best) best = streak;
    }
    return best;
  } catch {
    return 0;
  }
}

/** Perfect-day chain right now (streak service). */
async function perfectChainNow(): Promise<number> {
  try {
    const [habitModule, streakModule, recurrenceModule] = await Promise.all([
      import('./habitService'),
      import('./streakService'),
      import('./recurrenceService'),
    ]);
    const [habitList, completions] = await Promise.all([habitModule.loadHabits(), habitModule.loadCompletions()]);
    return streakModule.computePerfectDayStreak(habitList, completions, recurrenceModule.formatDate(new Date()));
  } catch {
    return 0;
  }
}

/** Total lifetime credited completions (quantity partials count as done). */
async function totalCompletions(): Promise<number> {
  try {
    const comps = await (await import('./habitService')).loadCompletions();
    return comps.filter((c) => c.completed || (c.count ?? 0) > 0).length;
  } catch {
    return 0;
  }
}

/** Resolves which titles are currently unlocked from real progress data. */
export async function getUnlockedTitles(): Promise<TitleDef[]> {
  const unlocked: TitleDef[] = [];
  for (const def of EQUIPPABLE_TITLES) {
    if (await isTitleUnlocked(def)) unlocked.push(def);
  }
  return unlocked;
}

async function isTitleUnlocked(def: TitleDef): Promise<boolean> {
  try {
    if (def.unlock === 'tree_hustler') return await treeCompleted('hustler');
    if (def.unlock === 'tree_sage') return await treeCompleted('sage');
    if (def.unlock === 'tree_aegis') return await treeCompleted('aegis');
    if (def.unlock === 'tree_chrono') return await treeCompleted('chrono');
    if (def.unlock === 'any_revive') {
      const hp = await import('./hpService');
      return (await hp.loadHpStore()).everRevived > 0;
    }
    if (def.unlock === 'ascended') {
      const p = await import('./prestigeService');
      return (await p.loadPrestigeStore()).count >= 1;
    }
    if (def.unlock === 'veteran_25') {
      const xp = await import('./xpService');
      return (await xp.loadTotalXp()) >= xp.totalXpForLevel(25); // level 25 reached
    }
    if (def.unlock === 'tycoon') {
      const economy = await import('./economyService');
      return (await economy.loadEconomy()).lifetimeEarned >= 1000;
    }
    // The rest are resolved natively against real progress ledgers — the old
    // badge store is gone.
    if (def.unlock === 'boss_slayer') return (await raidlessBossWins()) >= 3;
    if (def.unlock === 'streak_30') return (await bestHabitStreak()) >= 30;
    if (def.unlock === 'completions_100') return (await totalCompletions()) >= 100;
    if (def.unlock === 'perfect_week') return (await perfectChainNow()) >= 7;
    if (def.unlock === 'legend_master') {
      const store = await loadSkillStore();
      return store.owned.filter((n) => isLegendNodeId(n)).length >= 4;
    }
    return false;
  } catch {
    return false;
  }
}

export function titleNameById(titleId: string | null | undefined): string | null {
  if (!titleId) return null;
  return EQUIPPABLE_TITLES.find((t) => t.id === titleId)?.name ?? null;
}
