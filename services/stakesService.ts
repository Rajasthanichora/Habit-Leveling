// ─── Legacy stakes (feature retired) ─────────────────────────────────────────
//
// Risko-Stakes went against the app's spirit: this is a place to EARN, not to
// gamble. The whole system (staking UI, ×2 win payouts, loss settlement) was
// removed. What remains is the one-time fair-wind migration — every coin a
// player still had riding in an UNSETTLED stake is refunded straight into the
// wallet on the next boot. Already-lost stakes stay lost (they were paid out
// the moment their day closed), already-won stakes were paid on completion.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STAKES_KEY = '@habit_planner_stakes_v1';

interface LegacyStake {
  habitId: string;
  habitName: string;
  date: string;
  amount: number;
}

interface LegacyStore {
  active: LegacyStake[];
  history: LegacyStake[];
}

/**
 * Refunds every unsettled (active) legacy stake and clears the ledger.
 * Idempotent — after the first run the active list is empty, so every later
 * boot is a cheap no-op. Returns the total coins refunded.
 */
export async function refundAllActiveStakes(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STAKES_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Partial<LegacyStore> | null;
    const active = parsed?.active ?? [];
    const refund = active.reduce((sum, s) => sum + Math.max(0, Math.floor(s.amount ?? 0)), 0);
    if (refund <= 0) {
      // Nothing to pay out, but still clean the listing so this stays idle.
      const kept: LegacyStore = { active: [], history: parsed?.history ?? [] };
      await AsyncStorage.setItem(STAKES_KEY, JSON.stringify(kept));
      return 0;
    }
    const economy = await import('./economyService');
    await economy.earnCoins(refund, 'Stakes retired — refund 🎲');
    const kept: LegacyStore = { active: [], history: parsed?.history ?? [] };
    await AsyncStorage.setItem(STAKES_KEY, JSON.stringify(kept));
    return refund;
  } catch {
    return 0;
  }
}
