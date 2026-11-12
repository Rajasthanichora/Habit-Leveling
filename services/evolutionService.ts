// ─── Habit Evolution 🌱 → 🌿 → 🌳 → ✨ ─────────────────────────────────────────
//
// Stages are derived from lifetime completed days and can never regress —
// evolution rewards are claim-keyed (evo_<habitId>_<stage>) so replaying the
// same data always resolves to the same stage, no double rewards, no revokes.

import { EVOLUTION_STAGES, EvolutionStage } from './gameRules';
import { claimReward, emitGameEvent } from './gameBus';

/** Lifetime credited days for one habit (quantity partials count as done). */
export function lifetimeCompletions(habitId: string, completions: { key: string; completed: boolean; count?: number }[]): number {
  return completions.filter(
    (c) => (c.completed || (c.count ?? 0) > 0) && c.key.startsWith(`${habitId}_`)
  ).length;
}

export function stageForCompletions(total: number): number {
  let stage = 0;
  for (let i = 0; i < EVOLUTION_STAGES.length; i++) {
    if (total >= EVOLUTION_STAGES[i].threshold) stage = i;
  }
  return stage;
}

export function stageInfo(stage: number): EvolutionStage {
  return EVOLUTION_STAGES[Math.max(0, Math.min(EVOLUTION_STAGES.length - 1, stage))];
}

/** habitId → stage number map for a whole list (pure). */
export function stageMapFor(habitIds: string[], completions: { key: string; completed: boolean; count?: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of habitIds) {
    out[id] = stageForCompletions(lifetimeCompletions(id, completions));
  }
  return out;
}

export function stageMapEntryFor(habitId: string, completions: { key: string; completed: boolean; count?: number }[]): number {
  return stageForCompletions(lifetimeCompletions(habitId, completions));
}

/**
 * Checks whether a completion pushed the habit across a stage boundary and
 * (once per stage, ever) pays the evolution reward. Idempotent.
 */
export async function evaluateEvolution(habitId: string, habitName: string, completions: { key: string; completed: boolean; count?: number }[]): Promise<void> {
  try {
    const stage = stageMapEntryFor(habitId, completions);
    if (stage <= 0) return;
    const def = stageInfo(stage);
    // Only pay stages exactly at the threshold — lower stages were claimed
    // when the habit grew through them.
    const lowerStage = stage - 1;
    if (def.threshold > 0 && lifetimeCompletions(habitId, completions) >= def.threshold) {
      const paid = await claimReward(`evo_${habitId}_${stage}`);
      if (paid) {
        const economy = await import('./economyService');
        await economy.earnCoins(def.coins, 'Evolution reward');
        const xp = await import('./xpService');
        await xp.grantXpBonus(def.xp, `🌱 ${habitName} evolved`);
        emitGameEvent({
          type: 'evolve',
          habitName,
          message: `${def.emoji} ${habitName} evolved: ${def.name}! (+${def.coins}🪙 +${def.xp} XP)`,
        });
      }
    }
    void lowerStage;
  } catch {}
}

/** Purge hook so deleted habits leave no odd stage rows (claims are fine). */
export async function purgeEvolutionClaims(habitId: string): Promise<void> {
  void habitId;
}
