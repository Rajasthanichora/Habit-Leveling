// ─── Prestige / Rebirth 🕊️ (Phase 4D) ────────────────────────────────────────
//
// prestige_v1 store. At Level 50 the player may ascend:
//   • XP resets to 0 (the run restarts)
//   • every completion's XP gets a permanent +10% per rebirth (capped ×5)
//   • profile earns the golden frame, +3 Skill Points, 100 legacy coins
//   • skills / coins / habits are NEVER touched — only the XP meter resets.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRESTIGE } from './gameRules';
import { emitGameEvent, claimReward } from './gameBus';
import { withLock, LOCK_KEYS } from './writeLock';

const PRESTIGE_KEY = '@habit_planner_prestige_v1';

export interface PrestigeStore {
  version: 1;
  count: number;
  lastAt: string | null;
}

const EMPTY: PrestigeStore = { version: 1, count: 0, lastAt: null };

export async function loadPrestigeStore(): Promise<PrestigeStore> {
  try {
    const raw = await AsyncStorage.getItem(PRESTIGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PrestigeStore) : null;
    return {
      version: 1,
      count: Math.max(0, Math.floor(parsed?.count ?? 0)),
      lastAt: typeof parsed?.lastAt === 'string' ? parsed.lastAt : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

async function savePrestigeStore(store: PrestigeStore): Promise<void> {
  try {
    await AsyncStorage.setItem(PRESTIGE_KEY, JSON.stringify(store));
  } catch {}
}

export async function canAscendNow(level: number, count?: number): Promise<boolean> {
  const c = count ?? (await loadPrestigeStore()).count;
  return level >= PRESTIGE.requiredLevel && c < PRESTIGE.maxRebirths;
}

export async function prestigesUsed(): Promise<number> {
  return (await loadPrestigeStore()).count;
}

/**
 * Performs the ascension: XP → 0, +3 SP, 100 legacy coins, counter bump.
 * Returns false when the level gate isn't met or the ascensions run out.
 * Serialized + claim-keyed (`prestige_<newCount>`): the level/count gates
 * were read BEFORE the XP reset, so two overlapping invocations (double-tap
 * on a slow device) both passed and paid +3 SP / 100 coins TWICE.
 */
export async function ascend(): Promise<boolean> {
  try {
    const store = await loadPrestigeStore();
    if (store.count >= PRESTIGE.maxRebirths) return false;
    const nextCount = store.count + 1;
    // Payout is claim-keyed — a duplicate invocation is a true no-op.
    if (!(await claimReward(`prestige_${nextCount}`))) return false;

    return await withLock(LOCK_KEYS.prestige, async () => {
      const fresh = await loadPrestigeStore();
      if (fresh.count >= PRESTIGE.maxRebirths) return false;
      const xp = await import('./xpService');
      const level = (await xp.levelInfoFromTotal(await xp.loadTotalXp())).level;
      if (level < PRESTIGE.requiredLevel) return false;

      fresh.count += 1;
      fresh.lastAt = new Date().toISOString();
      await savePrestigeStore(fresh);

      // XP reset (raw store write — no level-up events fire on the way down).
      await xp.saveXp({ totalXp: 0 });

      // Legacy payout: SP + coins.
      const skill = await import('./skillService');
      await skill.grantSp(PRESTIGE.spReward);
      const economy = await import('./economyService');
      await economy.earnCoins(PRESTIGE.legacyCoins, 'Prestige legacy 🕊️', { silent: false });

      emitGameEvent({
        type: 'prestige',
        message: `🕊️ Rebirth #${fresh.count}! XP reset — permanent +${Math.round(PRESTIGE.xpBonusPerRebirth * 100 * fresh.count)}% XP`,
        count: fresh.count,
      });
      return true;
    });
  } catch {
    return false;
  }
}

/** Multiplier applied to positive XP grants. */
export function prestigeXpMult(count: number): number {
  return 1 + Math.min(0.5, PRESTIGE.xpBonusPerRebirth * Math.max(0, count));
}

export async function xpBonusMultAsync(): Promise<number> {
  return prestigeXpMult((await loadPrestigeStore()).count);
}
