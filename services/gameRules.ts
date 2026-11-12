// ─── GAME_RULES_V2 — the central tuning file ─────────────────────────────────
//
// Every economy / penalty / meta-progression number lives here. Balancing the
// game means editing ONE file. `version` is baked into every new store so old
// app versions can migrate safely (never re-shape an existing store without a
// bump + migration).
//
// Design rules (do not break):
//   • Coins / HP can never go negative — always floor at 0.
//   • Penalties apply ONLY on scheduled days (weekly-offs are never punished).
//   • Achievements / titles / evolution stages are granted once and never
//     revoked — unlocked stays unlocked.
//   • Everything is claim-keyed (pen_<habitId>_<date>, season_<id>, …) so
//     replaying a day is always idempotent.

export const RULES_VERSION = '3.0.0';

export { GAME_RULES } from './types'; // legacy phase-3 rules remain the luck source for quests

// ─── Economy ─────────────────────────────────────────────────────────────────

export const COIN_CAP = 999999;
export const LEDGER_MAX = 40;

export const ECONOMY_RULES = {
  version: 2,
  /** Base coins per completed scheduled day, by difficulty. */
  coinEarn: { easy: 4, medium: 6, hard: 9 } as Record<string, number>,
  /** Streak-scaled bonus: +1 % per streak day, capped (skill-tree extendable). */
  streakBonusPerDay: 0.01,
  streakBonusCap: 30,
  /** XP Storm item: +25% XP while active (24 h base). */
  xpStormMult: 1.25,
  /** Combo chain: consecutive completions within the window add up. */
  comboWindowMinutes: 40,
  comboSteps: { 3: 1.5, 6: 2, 9: 3 } as Record<number, number>,
  /** Insurance certificate: 7 base days (Aegis tree can extend it). */
  insuranceDays: 7,
  maxRebirths: 5,
} as const;

// ─── Level difficulty (xp-curve & payout scaling) ─────────────────────────────
//
// A separate knob from the PENALTY intensity: it shapes how hard it is to
// GROW. `gentle` is already the honest game — balanced/hardcore stretch the
// climb and lean out payouts for masochists. Never below gentle.

export type GameDifficulty = 'gentle' | 'balanced' | 'hardcore';

export interface DifficultyPreset {
  key: GameDifficulty;
  label: string;
  desc: string;
  /** Multiplier on the XP needed per level (higher = longer grind). */
  xpNeedMult: number;
  /** Multiplier on all XP earned (lower = starvation run). */
  xpEarnMult: number;
  /** Multiplier on all coins earned from completions (lower = lean wallet). */
  coinEarnMult: number;
}

export const DIFFICULTY_PRESETS: Record<GameDifficulty, DifficultyPreset> = {
  gentle: {
    key: 'gentle',
    label: '🪶 Gentle (default)',
    desc: 'The honest baseline — still hard. Realistic daily growth.',
    xpNeedMult: 1.0,
    xpEarnMult: 1.0,
    coinEarnMult: 1.0,
  },
  balanced: {
    key: 'balanced',
    label: '⚖️ Balanced',
    desc: '+45% XP per level, −15% XP & −20% coins earned.',
    xpNeedMult: 1.45,
    xpEarnMult: 0.85,
    coinEarnMult: 0.8,
  },
  hardcore: {
    key: 'hardcore',
    label: '🔥 Hardcore',
    desc: 'Double the climb. −32% XP & −40% coins earned.',
    xpNeedMult: 2.0,
    xpEarnMult: 0.68,
    coinEarnMult: 0.6,
  },
};

// ─── Penalty system ──────────────────────────────────────────────────────────

export type PenaltyIntensity = 'gentle' | 'balanced' | 'hardcore' | 'off';

export interface PenaltyPreset {
  key: PenaltyIntensity;
  label: string;
  desc: string;
  /** HP lost per missed scheduled day. */
  hpDamage: number;
  /** Coin fine per missed scheduled day. */
  fine: number;
  /** Extra fine when the boss habit escapes. */
  bossFine: number;
  /** Coin price to revive a collapsed habit. */
  revivePrice: number;
}

export const PENALTY_PRESETS: Record<PenaltyIntensity, PenaltyPreset> = {
  gentle: {
    key: 'gentle',
    label: '🪶 Gentle',
    desc: 'Soft taps. HP −10, fine −2, revive 25🪙',
    hpDamage: 10,
    fine: 2,
    bossFine: 5,
    revivePrice: 25,
  },
  balanced: {
    key: 'balanced',
    label: '⚖️ Balanced',
    desc: 'Fair tension. HP −20, fine −5, revive 40🪙',
    hpDamage: 20,
    fine: 5,
    bossFine: 10,
    revivePrice: 40,
  },
  hardcore: {
    key: 'hardcore',
    label: '🔥 Hardcore',
    desc: 'No mercy. HP −30, fine −10, revive 60🪙',
    hpDamage: 30,
    fine: 10,
    bossFine: 15,
    revivePrice: 60,
  },
  off: {
    key: 'off',
    label: '⏸️ Off',
    desc: 'Zen mode — HP & fines never bite',
    hpDamage: 0,
    fine: 0,
    bossFine: 0,
    revivePrice: 40,
  },
};

export const HP_RULES = {
  version: 1,
  maxHp: 100,
  /** HP healed (up to cap) when a scheduled habit is completed. */
  healPerCompletion: 10,
  /** Minimum HP chunk: HP is floored at 0, never negative. */
  reviveHp: 50,
  /** Phoenix (Aegis tree): survive one collapse per month at this HP. */
  phoenixHp: 25,
} as const;

// ─── Shop ────────────────────────────────────────────────────────────────────

export type LedgerLabel = (typeof COIN_LABELS)[keyof typeof COIN_LABELS];
export type SHOP_ITEM_ID = ShopItemEffect;

export type ShopItemEffect =
  | 'xp_potion'
  | 'freeze_token'
  | 'midas_touch'
  | 'sp_scroll'
  | 'xp_storm'
  | 'streak_shield'
  | 'skip_pass'
  | 'insurance'
  | 'revival_kit'
  // ── Legend Vault 🏛 — major level-up items (every 10 levels, higher tier,
  //    higher price, bigger reward; the unlock LEVEL itself stretches with the
  //    difficulty preset — see difficultyService.milestoneGateFor).
  | 'xp_elixir'
  | 'midas_gauntlet'
  | 'titan_shield'
  | 'eternal_storm'
  | 'legend_scroll';

export interface ShopItem {
  id: ShopItemEffect;
  name: string;
  icon: string;               // emoji
  desc: string;
  price: number;
  /** Which UI group renders it. */
  group: 'boost' | 'defense' | 'legend';
  /** How many units (or active charges) may exist at once. */
  maxStock: number;
  /** Player level gate — the shop teases the item earlier, sells later. */
  minLevel?: number;
  /**
   * Milestone item (⭐ every-10-levels tier): the level gate stretches with
   * the difficulty preset (gentle ×1 · balanced ×1.2 · hardcore ×1.4).
   */
  milestone?: boolean;
}

/**
 * Instant-XP drinks: item id → passive XP granted on "Drink"
 * (multiplied by the usual skill/prestige/storm bonuses at grant time).
 */
export const XP_DRINK_XP: Record<string, number> = {
  xp_potion: 40,
  xp_elixir: 90,
};

/**
 * Shop rules (Phase 5 rework + Legend Vault): every item is deliberately
 * rationed so skip tokens can never stockpile into a "never fail" cheat code.
 * Prices sit above casual income — buying is always a real trade-off. The
 * Legend Vault opens one tier per 10 levels and its gates stretch with the
 * difficulty preset.
 */
export const SHOP_CATALOG: ShopItem[] = [
  // Boost
  { id: 'xp_potion', name: 'XP Potion', icon: '🧪', price: 60, group: 'boost', maxStock: 3, desc: 'Instant +40 XP (one-time drink) — max 3 on the shelf' },
  { id: 'xp_storm', name: 'XP Storm', icon: '⚡', price: 140, group: 'boost', maxStock: 1, desc: '+25% XP while active (24h) — one storm at a time' },
  { id: 'freeze_token', name: 'Freeze Token', icon: '❄️', price: 60, group: 'boost', maxStock: 2, desc: '+1 extra streak freeze allowance for this month (max 2 spare)' },
  { id: 'midas_touch', name: 'Midas Touch', icon: '✨', price: 45, group: 'boost', maxStock: 3, desc: 'Next habit completion pays ×2 coins (max 3 charged)' },
  { id: 'sp_scroll', name: 'Skill Scroll', icon: '📜', price: 120, group: 'boost', maxStock: 3, minLevel: 8, desc: '+1 Skill Point — only while you hold < 3 unspent SP' },
  // Defense (penalty protection — the ONLY way to dodge the vault)
  { id: 'streak_shield', name: 'Streak Shield', icon: '🛡️', price: 75, group: 'defense', maxStock: 2, desc: 'Auto-absorbs one habit miss — before freezes, before HP (max 2)' },
  { id: 'skip_pass', name: 'Skip Day Pass', icon: '🎫', price: 150, group: 'defense', maxStock: 1, minLevel: 10, desc: 'Waives every penalty for one chosen day — max 1 in the vault' },
  { id: 'insurance', name: 'Habit Insurance', icon: '📜', price: 90, group: 'defense', maxStock: 2, desc: `HP damage −50% for one habit for ${ECONOMY_RULES.insuranceDays} days (max 2)` },
  { id: 'revival_kit', name: 'Revival Kit', icon: '🩹', price: 50, group: 'defense', maxStock: 1, desc: 'Instantly revive a collapsed habit (50 HP) — one kit on hand' },
  // Legend Vault ⭐ (major level-ups: Lv 10 / 20 / 30 / 40 / 50 — stretched by difficulty)
  { id: 'xp_elixir', name: 'XP Elixir', icon: '⚗️', price: 240, group: 'legend', maxStock: 2, minLevel: 10, milestone: true, desc: 'Milestone drink — instant +90 XP (max 2 on the shelf)' },
  { id: 'midas_gauntlet', name: 'Midas Gauntlet', icon: '🧤', price: 420, group: 'legend', maxStock: 5, minLevel: 20, milestone: true, desc: 'Milestone glove — the next 5 completions pay ×3 coins, one charge at a time' },
  { id: 'titan_shield', name: 'Titan Shield', icon: '🦾', price: 480, group: 'legend', maxStock: 3, minLevel: 30, milestone: true, desc: 'Milestone bulwark — auto-absorbs 3 habit misses before regular shields, freezes and HP' },
  { id: 'eternal_storm', name: 'Eternal Storm', icon: '🌩️', price: 700, group: 'legend', maxStock: 1, minLevel: 40, milestone: true, desc: 'Milestone tempest — +40% XP for 72h straight (stronger than XP Storm)' },
  { id: 'legend_scroll', name: 'Legend Scroll', icon: '📈', price: 1000, group: 'legend', maxStock: 2, minLevel: 50, milestone: true, desc: 'The endgame scroll — +2 Skill Points, instantly, no SP-wallet cap' },
];

/**
 * Pure helper: shop shelf count for an item (active charges count as stock).
 * Charge fields are optional so old callers stay type-safe.
 */
export function shelfCountOf(item: ShopItemLike, store: {
  inventory: Record<string, number>;
  midasCharges: number;
  gauntletCharges?: number;
  titanCharges?: number;
  xpStormUntil: number;
  xpStormStrength?: number;
}): number {
  switch (item.id) {
    case 'midas_touch': return Math.floor(store.midasCharges);
    case 'midas_gauntlet': return Math.floor(store.gauntletCharges ?? 0);
    case 'titan_shield': return Math.floor(store.titanCharges ?? 0);
    case 'xp_storm':
      return store.xpStormUntil > Date.now() && (store.xpStormStrength ?? ECONOMY_RULES.xpStormMult) <= 1.3 ? 1 : 0;
    case 'eternal_storm':
      return store.xpStormUntil > Date.now() && (store.xpStormStrength ?? 0) > 1.3 ? 1 : 0;
    case 'sp_scroll':
    case 'legend_scroll':
      return 0; // unlimited shelf; wallet/level guards apply
    default:
      return Math.max(0, Math.floor(store.inventory[item.id] ?? 0));
  }
}

/** Structural subset so the helper stays decoupled from the live economy. */
type ShopItemLike = Pick<ShopItem, 'id'>;

// ─── Coins earned on the ledger → labels shown nowhere, but handy for tests ──
export const COIN_LABELS = {
  completion: 'Completion',
  combo: 'Combo bonus',
  bonus: 'Achievement payout',
  rebuild: 'Rebuild mission',
  fine: 'Penalty fine',
  boss: 'Boss escaped',
  purchase: 'Shop purchase',
  revive: 'Revival',
  evolve: 'Evolution reward',
  season: 'Season reward',
  prestige: 'Prestige legacy',
} as const;

// ─── Skill trees (4 × 12 — earned one node at a time) ────────────────────────
//
// Rework: every tree grew from 4-5 to 12 parent-chained nodes, gated by
// level 3…30. A full tree now costs ~32 SP (≈ level 32 as a base) — the end
// of the game, not a snack. Chest-era powers were repurposed into streak /
// coin / revive economy powers. Old save stores migrate by refunding SP for
// every node id that no longer exists.

export type SkillTreeId = 'hustler' | 'sage' | 'aegis' | 'chrono';
export type SkillNodeId =
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'h7' | 'h8' | 'h9' | 'h10' | 'h11' | 'h12'
  | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' | 's9' | 's10' | 's11' | 's12'
  | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7' | 'a8' | 'a9' | 'a10' | 'a11' | 'a12'
  | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8' | 'c9' | 'c10' | 'c11' | 'c12'
  | 'l1' | 'l2' | 'l3' | 'l4' | 'l5' | 'l6' | 'l7' | 'l8' | 'l9';

export interface SkillNodeDef {
  id: SkillNodeId;
  tree: SkillTreeId;
  name: string;
  desc: string;
  cost: number;        // SP
  parent?: SkillNodeId;
  /** Player level required to buy (deep-tier gates). */
  minLevel?: number;
}

export interface SkillTreeDef {
  id: SkillTreeId;
  name: string;
  icon: string;        // emoji
  accent: string;      // hex
  blurb: string;
  nodes: SkillNodeDef[];
}

export const SKILL_TREES: SkillTreeDef[] = [
  {
    id: 'hustler',
    name: 'Midas Way',
    icon: '🪙',
    accent: '#FBBF24',
    blurb: 'Bigger coin flows',
    // Nerf pass (v3): grind-bought skills are deliberately weaker now — the
    // real power moved to the level-gated Legend skills (LEGEND_SKILLS below),
    // which are earned through raids, 7-day challenges and closed seasons.
    nodes: [
      { id: 'h1', tree: 'hustler', name: 'Coin Sense', desc: 'All coins earned +7%', cost: 1 },
      { id: 'h2', tree: 'hustler', name: 'Coin Magnet', desc: '+1 flat coin on every completion', cost: 1, parent: 'h1', minLevel: 3 },
      { id: 'h3', tree: 'hustler', name: 'Combo Maestro', desc: 'Combo window 40 → 70 min', cost: 2, parent: 'h2', minLevel: 5 },
      { id: 'h4', tree: 'hustler', name: 'Golden Touch', desc: 'All coins earned +13% more', cost: 2, parent: 'h3', minLevel: 9 },
      { id: 'h5', tree: 'hustler', name: 'Streak Vault', desc: 'Streak coin bonus cap 30 → 40 days', cost: 2, parent: 'h4', minLevel: 12 },
      { id: 'h6', tree: 'hustler', name: "Tongue of Bargains", desc: 'Every shop price −7%', cost: 2, parent: 'h5', minLevel: 15 },
      { id: 'h7', tree: 'hustler', name: 'Golden Streak', desc: 'Streak coins grow +1.25% per day instead of +1%', cost: 3, parent: 'h6', minLevel: 18 },
      { id: 'h8', tree: 'hustler', name: 'Heavy Pouch', desc: '+2 more flat coins per completion', cost: 3, parent: 'h7', minLevel: 21 },
      { id: 'h9', tree: 'hustler', name: 'Baron of Wins', desc: 'All coins earned +8% more', cost: 3, parent: 'h8', minLevel: 24 },
      { id: 'h10', tree: 'hustler', name: 'Midas Legacy', desc: 'All coins earned +16% more', cost: 4, parent: 'h9', minLevel: 27 },
      { id: 'h11', tree: 'hustler', name: 'Empire Builder', desc: 'All coins earned +10% more', cost: 4, parent: 'h10', minLevel: 30 },
      { id: 'h12', tree: 'hustler', name: 'Absolute Midas', desc: 'All coins earned +16% more — the crown of greed', cost: 5, parent: 'h11', minLevel: 32 },
    ],
  },
  {
    id: 'sage',
    name: 'Sage Mind',
    icon: '📚',
    accent: '#A78BFA',
    blurb: 'Sharper XP growth',
    nodes: [
      { id: 's1', tree: 'sage', name: "Scholar's Mind", desc: 'All XP gained +7%', cost: 1 },
      { id: 's2', tree: 'sage', name: 'Monument', desc: 'Streak milestone rewards +50%', cost: 1, parent: 's1', minLevel: 3 },
      { id: 's3', tree: 'sage', name: 'Empathy', desc: 'Every mood bonus +1 XP', cost: 2, parent: 's2', minLevel: 5 },
      { id: 's4', tree: 'sage', name: 'Ascendant', desc: 'All XP gained +10% more', cost: 2, parent: 's3', minLevel: 9 },
      { id: 's5', tree: 'sage', name: 'Steady Hand', desc: 'Quantity drip XP cap 4 → 6 units', cost: 2, parent: 's4', minLevel: 12 },
      { id: 's6', tree: 'sage', name: 'Checklist Sage', desc: 'Full-checklist bonus XP ×1.5', cost: 2, parent: 's5', minLevel: 15 },
      { id: 's7', tree: 'sage', name: 'Storm Builder', desc: 'XP Storm ⚡ lasts 8 h longer', cost: 3, parent: 's6', minLevel: 18 },
      { id: 's8', tree: 'sage', name: 'Deep Focus', desc: 'Completion XP streak cap 50 → 65 days', cost: 3, parent: 's7', minLevel: 21 },
      { id: 's9', tree: 'sage', name: 'Deep Calm', desc: 'Every mood bonus +1 XP more', cost: 3, parent: 's8', minLevel: 24 },
      { id: 's10', tree: 'sage', name: 'Ascended Mind', desc: 'All XP gained +10% more', cost: 4, parent: 's9', minLevel: 27 },
      { id: 's11', tree: 'sage', name: 'Flawless Insight', desc: 'Perfect-day bonus XP +30%', cost: 4, parent: 's10', minLevel: 30 },
      { id: 's12', tree: 'sage', name: 'Sage Crown', desc: 'All XP gained +10% more — the crown of wisdom', cost: 5, parent: 's11', minLevel: 32 },
    ],
  },
  {
    id: 'aegis',
    name: 'Iron Aegis',
    icon: '🛡️',
    accent: '#34D399',
    blurb: 'Penalties bite less',
    nodes: [
      { id: 'a1', tree: 'aegis', name: 'Thick Skin', desc: 'Coin fines −12%', cost: 1 },
      { id: 'a2', tree: 'aegis', name: 'Iron Resolve', desc: 'HP damage ×0.85', cost: 1, parent: 'a1', minLevel: 3 },
      { id: 'a3', tree: 'aegis', name: 'Vault Guard', desc: 'Coin fines −18% further', cost: 2, parent: 'a2', minLevel: 5 },
      { id: 'a4', tree: 'aegis', name: 'Phoenix', desc: 'Survive one collapse every month at 25 HP', cost: 2, parent: 'a3', minLevel: 9 },
      { id: 'a5', tree: 'aegis', name: 'Vitality', desc: 'Completions heal +2 extra HP', cost: 2, parent: 'a4', minLevel: 12 },
      { id: 'a6', tree: 'aegis', name: 'Second Wind', desc: 'HP damage ×0.94 more', cost: 2, parent: 'a5', minLevel: 15 },
      { id: 'a7', tree: 'aegis', name: 'Insurance Broker', desc: 'Habit insurance covers 3 extra days', cost: 3, parent: 'a6', minLevel: 18 },
      { id: 'a8', tree: 'aegis', name: 'Deep Freeze', desc: '+1 free monthly streak freeze', cost: 3, parent: 'a7', minLevel: 21 },
      { id: 'a9', tree: 'aegis', name: 'Phoenix Rebirth', desc: 'Revivals restore 10 HP more', cost: 3, parent: 'a8', minLevel: 24 },
      { id: 'a10', tree: 'aegis', name: 'Serene Core', desc: 'Rough-mood mercy trims fines to one third', cost: 4, parent: 'a9', minLevel: 27 },
      { id: 'a11', tree: 'aegis', name: 'Second Skin', desc: 'HP damage ×0.94 more', cost: 4, parent: 'a10', minLevel: 30 },
      { id: 'a12', tree: 'aegis', name: 'The Unbreakable', desc: 'Coin fines −12% more — nothing can sting you', cost: 5, parent: 'a11', minLevel: 32 },
    ],
  },
  {
    id: 'chrono',
    name: 'Chrono Vault',
    icon: '⏳',
    accent: '#67E8F9',
    blurb: 'Quests, raids, seasons & chains',
    nodes: [
      { id: 'c1', tree: 'chrono', name: 'Quest Sharpener', desc: 'Daily quest rewards +15%', cost: 1 },
      { id: 'c2', tree: 'chrono', name: 'Long Chain', desc: 'Combo window +20 min extra', cost: 2, parent: 'c1', minLevel: 3 },
      { id: 'c3', tree: 'chrono', name: 'Raid Commander', desc: 'Weekly raid payouts +25% XP', cost: 2, parent: 'c2', minLevel: 5 },
      { id: 'c4', tree: 'chrono', name: 'Time Healer', desc: 'Collapsed-habit revival price −15%', cost: 2, parent: 'c3', minLevel: 10 },
      { id: 'c5', tree: 'chrono', name: 'Boss Board', desc: 'Boss-day bonus XP +30%', cost: 2, parent: 'c4', minLevel: 12 },
      { id: 'c6', tree: 'chrono', name: 'Season Sovereign', desc: 'Season tier rewards +15%', cost: 3, parent: 'c5', minLevel: 15 },
      { id: 'c7', tree: 'chrono', name: 'Quest Master', desc: 'Daily quest rewards +15% more', cost: 3, parent: 'c6', minLevel: 18 },
      { id: 'c8', tree: 'chrono', name: 'Precision Engine', desc: 'Perfect-day bonus XP +25%', cost: 3, parent: 'c7', minLevel: 21 },
      { id: 'c9', tree: 'chrono', name: 'Fast Rebuild', desc: 'Rebuild missions take 2 days instead of 3', cost: 3, parent: 'c8', minLevel: 24 },
      { id: 'c10', tree: 'chrono', name: 'Rebuild Banker', desc: 'Rebuild mission coins ×1.25', cost: 4, parent: 'c9', minLevel: 27 },
      { id: 'c11', tree: 'chrono', name: 'Chain Architect', desc: 'Combo window +30 min extra', cost: 4, parent: 'c10', minLevel: 30 },
      { id: 'c12', tree: 'chrono', name: 'Eternal Clock', desc: 'Season tier rewards +35% more — master of time', cost: 5, parent: 'c11', minLevel: 32 },
    ],
  },
];

export const SP_PER_LEVEL = 1;
export const SP_PER_REBIRTH = 3;

// ─── Legend skills 🏆 — earned, never bought ─────────────────────────────────
//
// The badge/trophy system is gone. Its replacement: nine LEGEND skills that
// can never be bought with SP — they auto-unlock when the runner proves
// themself in the ARENA:
//   • 🐉 weekly raids cleared (claims: one tier per ISO week)
//   • 🏆 7-day challenges conquered (once per habit, ever)
//   • 🗓️ seasons closed at a *paid* tier (zero-completion seasons never count)
//
// Every node ALSO demands a player level AND scales its win-count with the
// difficulty preset — gentle ×1 · balanced ×1.25 · hardcore ×1.5 (rounded up).
// Nothing here is granted by repeating one trick: the counters are distinct
// event ledgers, not completions.

export type LegendKind = 'raid' | 'challenge' | 'season';
/** Which ledger a legend node counts. */
export type LegendStat = 'raidAny' | 'raidGold' | 'challenge' | 'season';

export interface LegendNodeDef {
  id: SkillNodeId;
  kind: LegendKind;
  icon: string;
  name: string;
  desc: string;
  /** Ledger being counted. */
  stat: LegendStat;
  /** Base events required — stretched by the difficulty preset. */
  wins: number;
  /** Player level gate (stable — the grind must also be grown into). */
  minLevel: number;
}

export const LEGEND_SKILLS: LegendNodeDef[] = [
  // 🐉 Raids
  { id: 'l1', kind: 'raid', icon: '🐉', name: 'Dragon Tamer', desc: 'Weekly raid payouts +25% more XP', stat: 'raidAny', wins: 3, minLevel: 12 },
  { id: 'l2', kind: 'raid', icon: '🔥', name: 'Fire Bounty', desc: 'Every raid clear also pays +20🪙', stat: 'raidGold', wins: 2, minLevel: 22 },
  { id: 'l3', kind: 'raid', icon: '⚔️', name: 'Warlord', desc: 'Weekly raid payouts +50% more XP', stat: 'raidAny', wins: 6, minLevel: 32 },
  // 🏆 7-day challenges
  { id: 'l4', kind: 'challenge', icon: '🏅', name: 'Momentum Seal', desc: 'Challenge rewards +50% (XP & coins)', stat: 'challenge', wins: 1, minLevel: 10 },
  { id: 'l5', kind: 'challenge', icon: '🧊', name: 'Streak Anchor', desc: '+1 extra monthly streak freeze', stat: 'challenge', wins: 3, minLevel: 20 },
  { id: 'l6', kind: 'challenge', icon: '🗿', name: 'Discipline Titan', desc: 'Challenge rewards +50% more again', stat: 'challenge', wins: 6, minLevel: 30 },
  // 🗓️ Seasons
  { id: 'l7', kind: 'season', icon: '🗓️', name: 'Calendar Keeper', desc: 'Season rewards +10%', stat: 'season', wins: 1, minLevel: 15 },
  { id: 'l8', kind: 'season', icon: '👑', name: 'Era Sovereign', desc: 'Season rewards +15% more', stat: 'season', wins: 3, minLevel: 26 },
  { id: 'l9', kind: 'season', icon: '♾️', name: 'Master of Eras', desc: 'Season rewards +20% more', stat: 'season', wins: 5, minLevel: 34 },
];

export function isLegendNodeId(id: SkillNodeId): boolean {
  return id.startsWith('l') && LEGEND_SKILLS.some((n) => n.id === id);
}

export function legendNodeById(id: SkillNodeId | string): LegendNodeDef | undefined {
  return LEGEND_SKILLS.find((n) => n.id === id);
}

// ─── Titles ──────────────────────────────────────────────────────────────────

export interface TitleDef {
  id: string;
  name: string;
  desc: string;
  /** Stable check id — resolved in skillService against real progress. */
  unlock: 'boss_slayer' | 'streak_30' | 'completions_100' | 'any_revive'
    | 'tycoon' | 'perfect_week' | 'ascended' | 'tree_hustler' | 'tree_sage' | 'tree_aegis'
    | 'tree_chrono' | 'veteran_25' | 'legend_master';
}

export const EQUIPPABLE_TITLES: TitleDef[] = [
  { id: 't_arena', name: 'Arena Blooded', desc: 'Own 4 Legend skills — forged in raids, challenges & seasons', unlock: 'legend_master' },
  { id: 't_boss', name: 'Boss Slayer', desc: 'Defeat 3 boss days', unlock: 'boss_slayer' },
  { id: 't_iron', name: 'Iron Will', desc: 'Hold a 30-day streak', unlock: 'streak_30' },
  { id: 't_century', name: 'Century Club', desc: '100 total completions', unlock: 'completions_100' },
  { id: 't_phoenix', name: 'Phoenix Risen', desc: 'Revive a collapsed habit', unlock: 'any_revive' },
  { id: 't_tycoon', name: 'Coin Tycoon', desc: 'Earn 1000 lifetime coins', unlock: 'tycoon' },
  { id: 't_perfect', name: 'The Flawless', desc: '7 perfect days in a row', unlock: 'perfect_week' },
  { id: 't_ascend', name: 'Ascended', desc: 'Rebirth once', unlock: 'ascended' },
  { id: 't_midas', name: 'Grand Midas', desc: 'Complete the Midas Way tree', unlock: 'tree_hustler' },
  { id: 't_sage', name: 'Grand Sage', desc: 'Complete the Sage Mind tree', unlock: 'tree_sage' },
  { id: 't_aegis', name: 'The Unbreakable', desc: 'Complete the Iron Aegis tree', unlock: 'tree_aegis' },
  { id: 't_chrono', name: 'Grand Chrono', desc: 'Complete the Chrono Vault tree', unlock: 'tree_chrono' },
  { id: 't_veteran', name: 'Seasoned Runner', desc: 'Reach Level 25', unlock: 'veteran_25' },
];

// ─── Habit Evolution 🌱→✨ ────────────────────────────────────────────────────

export interface EvolutionStage {
  emoji: string;
  name: string;
  /** Lifetime completed days needed. */
  threshold: number;
  coins: number;
  xp: number;
}

export const EVOLUTION_STAGES: EvolutionStage[] = [
  // First four stages are frozen in place — existing claims are keyed by
  // stage index (`evo_<habitId>_<stage>`) so reshaping them would re-trigger
  // or regress unlocks. New tiers append at the end with higher thresholds.
  { emoji: '🌱', name: 'Seedling', threshold: 0, coins: 0, xp: 0 },
  { emoji: '🌿', name: 'Sprout', threshold: 7, coins: 15, xp: 10 },
  { emoji: '🌳', name: 'Flourishing', threshold: 30, coins: 30, xp: 25 },
  { emoji: '✨', name: 'Radiant', threshold: 100, coins: 60, xp: 50 },
  { emoji: '🌺', name: 'Everbloom', threshold: 150, coins: 80, xp: 65 },
  { emoji: '💎', name: 'Eternal', threshold: 250, coins: 120, xp: 90 },
  { emoji: '👑', name: 'Mythic', threshold: 400, coins: 200, xp: 140 },
];

// ─── Prestige / Rebirth 🕊️ ────────────────────────────────────────────────────

export const PRESTIGE = {
  requiredLevel: 50,
  xpBonusPerRebirth: 0.10,
  legacyCoins: 100,
  spReward: SP_PER_REBIRTH,
  maxRebirths: 5,
} as const;

// ─── Season Clock 🗓️ ──────────────────────────────────────────────────────────

export const SEASON = {
  lengthDays: 30,
  /** Seasons roll from this fixed local date; offline & deterministic. */
  epochISO: '2026-01-01',
  tiers: [
    { key: 'bronze', label: 'Bronze', min: 0, coins: 25, xp: 0, lv: 1 },
    { key: 'silver', label: 'Silver', min: 0.4, coins: 60, xp: 25, lv: 1 },
    { key: 'gold', label: 'Gold', min: 0.6, coins: 120, xp: 60, lv: 1 },
    { key: 'diamond', label: 'Diamond', min: 0.8, coins: 250, xp: 150, lv: 10 },
    { key: 'mythic', label: 'Mythic', min: 0.9, coins: 450, xp: 280, lv: 25 },
  ] as const,
} as const;

export type SeasonTierKey = (typeof SEASON.tiers)[number]['key'];
