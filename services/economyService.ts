// ─── Coin economy + shop + Combo (Phase 4A · Phase 5 rework) ─────────────────
//
// economy_v2 store. Rules baked in:
//   • Coins floor at 0 — negative balances are impossible.
//   • Every payout that must not repeat goes through a claim key
//     (evo keys live elsewhere).
//   • Completion coins are stored on the completion record (`coins`) so an
//     un-complete refunds exactly what was granted — no drift.
//   • Combo: consecutive completions inside the skill-scaled window build a
//     multiplier (×1.5 → ×2 → ×3) on coin income.
//   • The Daily Chest system was retired in Phase 5 — coins now flow only
//     through completions, quests, seasons and rebuild missions, so
//     the shop is rationed with real stock limits (see SHOP_CATALOG).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COIN_CAP,
  COIN_LABELS,
  ECONOMY_RULES,
  LEDGER_MAX,
  SHOP_CATALOG,
  shelfCountOf,
} from './gameRules';
import type { SHOP_ITEM_ID } from './gameRules';
import { claimReward, emitGameEvent, isClaimed } from './gameBus';
import { milestoneGateFor } from './difficultyService';
import { withLock, LOCK_KEYS } from './writeLock';

const ECONOMY_KEY = '@habit_planner_economy_v1';

export interface LedgerEntry {
  t: number;      // epoch ms
  d: number;      // delta (signed)
  label: string;
}

export interface EconomyStore {
  version: 2;
  coins: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  inventory: Record<string, number>;
  /** habitId → insurance expiry 'YYYY-MM-DD'. */
  insurance: Record<string, string>;
  /** Midas Touch charges: next N completions pay ×2. */
  midasCharges: number;
  /** Milestone 🧤 Midas Gauntlet charges: next N completions pay ×3, one at a time. */
  gauntletCharges: number;
  /** Milestone 🦾 Titan Shield charges: auto-absorbs N habit misses before regular shields. */
  titanCharges: number;
  /** XP Storm: epoch ms until which all XP pays +25%. */
  xpStormUntil: number;
  /** Storm strength multiplier while active — 🌩️ Eternal Storm raises it above the base. */
  xpStormStrength: number;
  /** Epoch ms until which the 🌩️ Eternal (elevated) strength itself applies. */
  eternalStormUntil: number;
  combo: { count: number; lastAtMs: number | null };
  ledger: LedgerEntry[];
}

const EMPTY: EconomyStore = {
  version: 2,
  coins: 0,
  lifetimeEarned: 0,
  lifetimeSpent: 0,
  inventory: {},
  insurance: {},
  midasCharges: 0,
  gauntletCharges: 0,
  titanCharges: 0,
  xpStormUntil: 0,
  xpStormStrength: 1,
  eternalStormUntil: 0,
  combo: { count: 0, lastAtMs: null },
  ledger: [],
};

/**
 * Normalize + migrate. The daily-chest system died in Phase 5: dropped-item
 * holdings (Mystery Keys 🗝️ 25🪙, Lucky Charms 🍀 100🪙) are converted back to
 * coins once — their value stays in the economy, and the shop floor no longer
 * sells chest tickets. Cross-version cash/inventory/ledger keep their value.
 */
function normalize(raw: Partial<EconomyStore> | null): EconomyStore {
  const inventoryIn = raw?.inventory && typeof raw.inventory === 'object' ? { ...raw.inventory } : {};
  let refund = 0;
  const knownIds = new Set(SHOP_CATALOG.map((i) => i.id as string));
  for (const key of Object.keys(inventoryIn)) {
    if (!knownIds.has(key)) {
      const n = Math.max(0, Math.floor(inventoryIn[key] ?? 0));
      refund += n * (key === 'lucky_charm' ? 100 : key === 'mystery_key' ? 25 : 0);
      delete inventoryIn[key];
    }
  }
  return {
    version: 2,
    coins: clampCoins((raw?.coins ?? 0) + refund),
    lifetimeEarned: Math.max(0, raw?.lifetimeEarned ?? 0) + refund,
    lifetimeSpent: Math.max(0, raw?.lifetimeSpent ?? 0),
    inventory: inventoryIn,
    insurance: raw?.insurance ?? {},
    midasCharges: Math.max(0, raw?.midasCharges ?? 0),
    gauntletCharges: Math.min(20, Math.max(0, raw?.gauntletCharges ?? 0)),
    titanCharges: Math.min(9, Math.max(0, raw?.titanCharges ?? 0)),
    xpStormUntil: Math.max(0, raw?.xpStormUntil ?? 0),
    xpStormStrength: Math.max(1, raw?.xpStormStrength ?? 1),
    eternalStormUntil: Math.max(0, raw?.eternalStormUntil ?? 0),
    combo: raw?.combo ?? { count: 0, lastAtMs: null },
    ledger: Array.isArray(raw?.ledger) ? raw!.ledger.slice(-LEDGER_MAX) : [],
  };
}

function clampCoins(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(COIN_CAP, Math.floor(v)));
}

export async function loadEconomy(): Promise<EconomyStore> {
  try {
    const raw = await AsyncStorage.getItem(ECONOMY_KEY);
    const store = raw ? normalize(JSON.parse(raw) as Partial<EconomyStore>) : { ...EMPTY };
    // Persist the once-off retirement of chest items so the refund isn't
    // recomputed on every read. A version-2 store can still carry the legacy
    // chest keys (the retirement landed mid-v2), so the inventory has to be
    // checked too — otherwise normalize() re-refunds the same items on every
    // load and the wallet inflates until an unrelated write happens to save.
    if (!raw) return store;
    const parsedRaw = JSON.parse(raw) as Partial<EconomyStore>;
    const rawInventory = parsedRaw?.inventory && typeof parsedRaw.inventory === 'object' ? parsedRaw.inventory : {};
    const knownIds = new Set(SHOP_CATALOG.map((i) => i.id as string));
    const hasLegacyItems = Object.keys(rawInventory).some((k) => !knownIds.has(k));
    if (parsedRaw?.version !== 2 || hasLegacyItems) {
      await saveEconomy(store);
    }
    return store;
  } catch {
    return { ...EMPTY };
  }
}

async function saveEconomy(store: EconomyStore): Promise<void> {
  try {
    await AsyncStorage.setItem(ECONOMY_KEY, JSON.stringify(store));
  } catch {}
}

// ─── Core coin flow ──────────────────────────────────────────────────────────

/** Adds coins (floored at cap). Returns true when coins were granted.
 *  `asRefund` books the coins as a refund — NOT into lifetimeEarned, which
 *  would inflate the statistics' earned-total for money never earned. */
export async function earnCoins(
  amount: number,
  label: string = COIN_LABELS.bonus,
  opts?: { silent?: boolean; claimKey?: string; asRefund?: boolean }
): Promise<{ ok: boolean; coins: number }> {
  if (opts?.claimKey && (await isClaimed(opts.claimKey))) {
    const s = await loadEconomy();
    return { ok: false, coins: s.coins };
  }
  const gain = Math.max(0, Math.round(amount));
  if (gain <= 0) return { ok: false, coins: (await loadEconomy()).coins };
  // Serialized: a completion's coin grant racing a shop purchase wrote whole
  // stale stores over each other — one write (grant or deduction) vanished.
  const result = await withLock(LOCK_KEYS.economy, async () => {
    const store = await loadEconomy();
    const before = store.coins;
    store.coins = clampCoins(before + gain);
    const delta = store.coins - before;
    if (!opts?.asRefund) store.lifetimeEarned += delta; // cap-aware real delta
    store.ledger.push({ t: Date.now(), d: delta, label });
    store.ledger = store.ledger.slice(-LEDGER_MAX);
    await saveEconomy(store);
    if (opts?.claimKey) await claimReward(opts.claimKey);
    if (!opts?.silent) {
      emitGameEvent({ type: 'coin', message: `🪙 ${label}`, coins: delta });
    }
    return { ok: true, coins: store.coins };
  });
  return result;
}

/** The wallet deduction itself (expects the caller to hold the economy lock).
 *  @internal */
async function spendCoinsCore(amount: number, label: string): Promise<boolean> {
  const cost = Math.max(0, Math.round(amount));
  const store = await loadEconomy();
  if (store.coins < cost) return false;
  store.coins = clampCoins(store.coins - cost);
  store.lifetimeSpent += cost;
  store.ledger.push({ t: Date.now(), d: -cost, label });
  store.ledger = store.ledger.slice(-LEDGER_MAX);
  await saveEconomy(store);
  return true;
}

/** Spends coins with a strict >= amount check. Never goes negative.
 *  The balance check + deduction run inside the lock: two fast purchases (or a
 *  purchase racing a coin grant) could both pass against a stale snapshot. */
export async function spendCoins(amount: number, label: string = COIN_LABELS.purchase): Promise<boolean> {
  return withLock(LOCK_KEYS.economy, () => spendCoinsCore(amount, label));
}

/**
 * Penalty-side coin removal — intended for fines that are NOT purchases and
 * must not fail when coins are already 0 (floor keeps them safe).
 */
export async function forceDrainCoins(amount: number, label: string): Promise<number> {
  const drain = Math.max(0, Math.round(amount));
  if (drain <= 0) return 0;
  return withLock(LOCK_KEYS.economy, async () => {
    const store = await loadEconomy();
    const before = store.coins;
    store.coins = clampCoins(before - drain);
    const actual = before - store.coins;
    if (actual > 0) {
      store.lifetimeSpent += actual;
      store.ledger.push({ t: Date.now(), d: -actual, label });
      store.ledger = store.ledger.slice(-LEDGER_MAX);
      await saveEconomy(store);
    } else {
      await saveEconomy(store);
    }
    return actual;
  });
}

/**
 * Refund-side coin removal — the exact inverse of earnCoins({ asRefund }):
 * takes coins OUT of the wallet without touching lifetimeEarned (money that
 * is being un-earned) or lifetimeSpent (it was never a purchase). Used by the
 * un-complete refund path so a toggle loop can never print coins.
 */
export async function revokeCoins(amount: number, label: string): Promise<void> {
  const revoke = Math.max(0, Math.round(amount));
  if (revoke <= 0) return;
  await withLock(LOCK_KEYS.economy, async () => {
    const store = await loadEconomy();
    const before = store.coins;
    store.coins = clampCoins(before - revoke);
    const actual = before - store.coins;
    if (actual > 0) {
      store.ledger.push({ t: Date.now(), d: -actual, label });
      store.ledger = store.ledger.slice(-LEDGER_MAX);
    }
    await saveEconomy(store);
  });
}

// ─── Combo chain ─────────────────────────────────────────────────────────────

export interface ComboUpdate {
  count: number;
  multiplier: number;
  /** Multiplier before this completion's chain step (the one applied to coins). */
  appliedMultiplier: number;
  justStepped: boolean;
}

function multiplierForCount(count: number): number {
  const steps = Object.entries(ECONOMY_RULES.comboSteps).map(([k, v]) => [Number(k), v] as const);
  let m = 1;
  for (const [need, mult] of steps) {
    if (count >= need) m = mult;
  }
  return m;
}

/**
 * Registers a completion timestamp and returns the multiplier to apply for
 * this completion (based on the chain BEFORE it). Same-day chains only.
 */
export async function registerCompletionForCombo(date: string): Promise<ComboUpdate> {
  // Serialized: two completions in the same tick otherwise both read the old
  // chain state and the combo step is lost.
  return withLock(LOCK_KEYS.economy, async () => await registerCompletionForComboInner(date));
}

async function registerCompletionForComboInner(date: string): Promise<ComboUpdate> {
  const store = await loadEconomy();
  const now = Date.now();
  const windowMin = await (async () => {
    const skill = await import('./skillService');
    return skill.comboWindowMinutes();
  })();
  const lastMs = store.combo.lastAtMs;
  const lastDate = lastMs ? new Date(lastMs) : null;
  const sameDay = lastDate
    ? `${lastDate.getFullYear()}-${lastDate.getMonth()}-${lastDate.getDate()}` ===
      `${new Date(now).getFullYear()}-${new Date(now).getMonth()}-${new Date(now).getDate()}`
    : false;
  const insideWindow = !!lastMs && sameDay && now - lastMs <= windowMin * 60000;

  const beforeCount = insideWindow ? store.combo.count : 0;
  const nextCount = insideWindow ? beforeCount + 1 : 1;
  store.combo = { count: nextCount, lastAtMs: now };
  await saveEconomy(store);

  // The Nth completion pays at the tier it itself reaches — comboSteps{3:×1.5}
  // means the 3rd completion in the chain pays ×1.5 (previously it paid ×1 and
  // advertised ×1.5, so the toast never matched the coins that landed).
  const applied = multiplierForCount(nextCount);
  void date;
  if (applied > multiplierForCount(beforeCount)) {
    emitGameEvent({
      type: 'combo',
      message: `🔥 Combo ×${applied} — ${nextCount} in a chain!`,
      multiplier: applied,
    });
  }
  return { count: nextCount, multiplier: applied, appliedMultiplier: applied, justStepped: true };
}

export function computeComboMultiplier(count: number): number {
  return multiplierForCount(count);
}

// ─── Shop ────────────────────────────────────────────────────────────────────

export function itemPrice(id: SHOP_ITEM_ID): number {
  return SHOP_CATALOG.find((i) => i.id === id)?.price ?? 0;
}

export async function inventoryCount(id: SHOP_ITEM_ID): Promise<number> {
  const store = await loadEconomy();
  return Math.max(0, Math.floor(store.inventory[id] ?? 0));
}

export async function addInventory(id: SHOP_ITEM_ID, n = 1): Promise<void> {
  await withLock(LOCK_KEYS.economy, async () => {
    const store = await loadEconomy();
    store.inventory[id] = Math.max(0, Math.floor(store.inventory[id] ?? 0)) + Math.max(1, n);
    await saveEconomy(store);
  });
}

/** Removes & returns true when the unit was consumed. */
export async function consumeInventory(id: SHOP_ITEM_ID): Promise<boolean> {
  return (await spendInventory(id, 1)) === 1;
}

export async function spendInventory(id: SHOP_ITEM_ID, n: number): Promise<number> {
  return withLock(LOCK_KEYS.economy, async () => {
    const store = await loadEconomy();
    const have = store.inventory[id] ?? 0;
    const used = Math.max(0, Math.min(have, n));
    if (used > 0) {
      store.inventory[id] = have - used;
      await saveEconomy(store);
    }
    return used;
  });
}

export interface BuyResult {
  ok: boolean;
  error?: 'insufficient' | 'unknown' | 'limit' | 'level' | 'sp_full';
  itemId?: SHOP_ITEM_ID;
}

/** Live price after skill haggling (Midas 'Tongue of Bargains'). */
export async function itemPriceFor(id: SHOP_ITEM_ID): Promise<number> {
  const item = SHOP_CATALOG.find((i) => i.id === id);
  if (!item) return 0;
  const skill = await import('./skillService');
  const mult = (await skill.priceMult()) || 1;
  return Math.max(1, Math.round(item.price * mult));
}

/** Units already "on the shelf" for a limit (chest-era). */
export async function stockCountFor(id: SHOP_ITEM_ID): Promise<number> {
  const item = SHOP_CATALOG.find((i) => i.id === id);
  if (!item) return 0;
  const store = await loadEconomy();
  return shelfCountOf(item, store);
}

/**
 * Purchase gate chain: known → level reached → stock limit open → wallet has
 * the (skill-discounted) price → effect applied. Deliberately rationed: skip
 * passes and shields can never pile up into a never-fail stockpile.
 */
export async function buyItem(id: SHOP_ITEM_ID): Promise<BuyResult> {
  const item = SHOP_CATALOG.find((i) => i.id === id);
  if (!item) return { ok: false, error: 'unknown' };

  // Player level gate — milestone items stretch with the difficulty preset
  // (gentle = base · balanced ×1.2 · hardcore ×1.4, rounded).
  if (item.minLevel != null) {
    try {
      const xp = await import('./xpService');
      const milestone = (item as { milestone?: boolean }).milestone === true;
      const gate = milestoneGateFor(item.minLevel, milestone) ?? item.minLevel;
      const level = xp.levelInfoFromTotal((await xp.loadXp()).totalXp).level;
      if (level < gate) return { ok: false, error: 'level', itemId: id };
    } catch {
      return { ok: false, error: 'level', itemId: id };
    }
  }

  // The whole stock-check → pay → apply-grant transaction runs under the
  // economy lock: the gates read, the wallet pays and the store slots the
  // item in — racing a completion's coin grant otherwise clobbered one
  // side of that transaction entirely.
  // NOTE: no skills-lock call may happen inside this lock. The SP-scroll
  // grants are deferred to after it releases (see pendingSpGrant) because
  // resetSkills holds the skills lock while taking the economy lock.
  let pendingSpGrant = 0;
  // Explicit BuyResult annotation: without it the generic inference widens the
  // `error` literals ('limit', 'level', …) to `string` and the outer return
  // stops matching the declared BuyResult union.
  const result = await withLock<BuyResult>(LOCK_KEYS.economy, async (): Promise<BuyResult> => {

  // Stock limit (skill scrolls are SP-guarded instead).
  if (id === 'sp_scroll') {
    const skill = await import('./skillService');
    if ((await skill.loadSkillStore()).sp >= 3) {
      return { ok: false, error: 'sp_full', itemId: id };
    }
  } else {
    const itemAny = item as unknown as { maxStock?: number };
    const max = itemAny.maxStock ?? 99;
    if ((await stockCountFor(id)) >= max) {
      return { ok: false, error: 'limit', itemId: id };
    }
  }

  // Price (with skill discount).
  const price = await itemPriceFor(id);
  if (!(await spendCoinsCore(price, `${COIN_LABELS.purchase}: ${item.icon} ${item.name}`))) {
    return { ok: false, error: 'insufficient', itemId: id };
  }

  const store = await loadEconomy();
  switch (id) {
    case 'midas_touch':
      store.midasCharges += 1;
      break;
    case 'midas_gauntlet':
      // Milestone glove: one purchase = 5 ×3-coin charges (maxStock 5 → ≤20).
      store.gauntletCharges = Math.min(20, store.gauntletCharges + 5);
      emitGameEvent({ type: 'claim', message: '🧤 Midas Gauntlet — next 5 completions pay ×3 coins', xp: 0 });
      break;
    case 'titan_shield':
      // Milestone bulwark: one purchase arms 3 auto-absorbed misses.
      store.titanCharges = Math.min(9, store.titanCharges + 3);
      emitGameEvent({ type: 'claim', message: '🦾 Titan Shield armed — absorbs the next 3 misses', xp: 0 });
      break;
    case 'xp_storm': {
      // 24h (+ Sage 'Storm Builder' hours) of +25% XP — extends if bought again.
      const skill = await import('./skillService');
      const hours = 24 + ((await skill.xpStormHoursExtra()) || 0);
      store.xpStormUntil = Math.max(store.xpStormUntil ?? 0, Date.now()) + hours * 3600_000;
      // The cheaper base storm pays base strength — it must not ride along at
      // the Eternal tier just because that storm ran earlier (the elevated
      // strength keeps applying separately until its own timer expires).
      store.xpStormStrength = 1;
      emitGameEvent({ type: 'claim', message: `⚡ XP Storm active — +25% XP for ${hours}h`, xp: 0 });
      break;
    }
    case 'eternal_storm': {
      // Milestone tempest: 72h straight of +40% XP (stronger base storm).
      store.xpStormUntil = Math.max(store.xpStormUntil ?? 0, Date.now()) + 72 * 3600_000;
      store.eternalStormUntil = Math.max(store.eternalStormUntil ?? 0, Date.now()) + 72 * 3600_000;
      store.xpStormStrength = Math.max(store.xpStormStrength ?? 1, 1.4);
      emitGameEvent({ type: 'claim', message: '🌩️ Eternal Storm — +40% XP for 72h', xp: 0 });
      break;
    }
    case 'sp_scroll': {
      // No inventory — the SP is granted immediately, but AFTER the economy
      // lock releases: grantSp takes the skills lock, and resetSkills holds
      // the skills lock while draining coins through the economy lock, so
      // granting here inside the economy lock would deadlock (ABBA cycle).
      pendingSpGrant = 1;
      break;
    }
    case 'legend_scroll': {
      // Endgame scroll: +2 SP at once, ignoring the 3-SP wallet cap — the
      // grant is deferred past the lock for the same deadlock reason.
      pendingSpGrant = 2;
      break;
    }
    default:
      store.inventory[id] = (store.inventory[id] ?? 0) + 1;
  }
  await saveEconomy(store);
  return { ok: true, itemId: id };
  });
  // Deferred SP grant — it MUST run outside the economy lock (see the
  // deadlock note above): grantSp takes the skills lock, and resetSkills
  // holds the skills lock while draining coins through the economy lock.
  // Granting inside the lock re-created that ABBA cycle (app-wide freeze).
  if (pendingSpGrant > 0) {
    const skill = await import('./skillService');
    await skill.grantSp(pendingSpGrant);
  }
  return result;
}

// ─── Boost multipliers (XP Storm / Midas) ────────────────────────────────────

/** XP multiplier from an active storm window — 🌩️ Eternal Storm outruns the base. */
export async function xpBoostMult(): Promise<number> {
  const store = await loadEconomy();
  if ((store.xpStormUntil ?? 0) > Date.now()) {
    // Live 🌩️ Eternal window keeps its elevated strength; a plain ⚡ storm
    // always pays the flat base tier, never the eternal's leaked +40%.
    const eternalLive = (store.eternalStormUntil ?? 0) > Date.now();
    return eternalLive ? Math.max(ECONOMY_RULES.xpStormMult, store.xpStormStrength ?? 1) : Math.max(ECONOMY_RULES.xpStormMult, 1);
  }
  return 1;
}

/** Consumes one 🦾 Titan Shield charge when armed (penalty close chain). */
export async function consumeTitanCharge(): Promise<boolean> {
  return withLock(LOCK_KEYS.economy, async () => {
    const store = await loadEconomy();
    if ((store.titanCharges ?? 0) <= 0) return false;
    store.titanCharges = (store.titanCharges ?? 0) - 1;
    await saveEconomy(store);
    emitGameEvent({ type: 'coin', message: `🦾 Titan Shield absorbed the miss — ${store.titanCharges} charge${store.titanCharges === 1 ? '' : 's'} left`, coins: 0 });
    return true;
  });
}

/**
 * Consumes one coin-boost charge if available and reports its strength:
 * 'x3' (🧤 Midas Gauntlet outranks; the milestone tier) then 'x2'
 * (Midas Touch). Null when no charge is armed.
 */
export async function useCoinBoostIfActive(): Promise<'x2' | 'x3' | null> {
  // Serialized so a completion chain can't consume two charges while paying
  // for only one boost.
  return withLock(LOCK_KEYS.economy, async () => {
    const store = await loadEconomy();
    if (store.gauntletCharges > 0) {
      store.gauntletCharges -= 1;
      await saveEconomy(store);
      return 'x3';
    }
    if (store.midasCharges > 0) {
      store.midasCharges -= 1;
      await saveEconomy(store);
      return 'x2';
    }
    return null;
  });
}

// ─── Insurance ───────────────────────────────────────────────────────────────

/** Assigns a bought insurance certificate to a habit for N days (+ Aegis skill). */
export async function assignInsurance(habitId: string, habitName: string): Promise<boolean> {
  const consumed = await consumeInventory('insurance');
  if (!consumed) return false;
  const skill = await import('./skillService');
  const days = ECONOMY_RULES.insuranceDays + ((await skill.insuranceDaysExtra()) || 0);
  // The certificate write runs under the lock — this store is shared with the
  // wallet and every other inventory entry.
  await withLock(LOCK_KEYS.economy, async () => {
    const store = await loadEconomy();
    const start = new Date();
    const end = new Date(start.getTime() + days * 86400000);
    end.setHours(23, 59, 59, 999);
    store.insurance[habitId] = `${String(end.getFullYear()).padStart(4, '0')}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    await saveEconomy(store);
  });
  void habitName;
  return true;
}

export async function isInsured(habitId: string, date: string): Promise<boolean> {
  const store = await loadEconomy();
  const expiry = store.insurance[habitId];
  if (!expiry) return false;
  return expiry >= date;
}

export async function removeInsurance(habitId: string): Promise<void> {
  const store = await loadEconomy();
  if (store.insurance[habitId]) {
    delete store.insurance[habitId];
    await saveEconomy(store);
  }
}
