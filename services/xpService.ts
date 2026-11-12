import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CompletionMood,
  GAME_RULES,
  Habit,
  HabitCompletion,
  LevelInfo,
  XpState,
} from './types';
import { ECONOMY_RULES, SP_PER_LEVEL } from './gameRules';
import { computeHabitStreak, isDayPerfect, lifetimeFreezesUsed, frozenDatesForHabit } from './streakService';
import {
  claimReward,
  emitGameEvent,
} from './gameBus';
import { coinEarnMult, xpEarnMult, xpNeedMult } from './difficultyService';
import { withLock, LOCK_KEYS } from './writeLock';

const XP_KEY = '@habit_planner_xp';

// Re-exported for every consumer that lives on the game bus.
export {
  claimReward,
  isClaimed,
  loadClaims,
  subscribeGameEvents,
} from './gameBus';
export type { GameEvent } from './gameBus';

// ─── Levels & titles ───────────────────────────────────────────────────────

/**
 * XP needed to climb FROM `level` to level+1 — the realistic curve:
 * 60 + 28/level + quadratic growth, scaled by the difficulty preset.
 * Level 1 ≈ 90 XP, level 10 ≈ 490, level 25 ≈ 1,697, level 49 ≈ 5,033.
 */
export function xpForLevel(level: number): number {
  const need = Math.round(60 + level * 28 + Math.floor(level * level * 1.5));
  return Math.round(need * xpNeedMult());
}

/** Total XP accumulated arriving AT `level` (sum of all curves below it). */
export function totalXpForLevel(level: number): number {
  let acc = 0;
  for (let i = 1; i < level; i++) acc += xpForLevel(i);
  return acc;
}

const LEVEL_TITLES: { min: number; title: string }[] = [
  { min: 1, title: 'Novice' },
  { min: 4, title: 'Apprentice' },
  { min: 8, title: 'Fighter' },
  { min: 12, title: 'Warrior' },
  { min: 18, title: 'Elite Warrior' },
  { min: 25, title: 'Champion' },
  { min: 35, title: 'Hero' },
  { min: 50, title: 'Legend' },
  { min: 75, title: 'Master' },
];

export function titleForLevel(level: number): string {
  let title = LEVEL_TITLES[0].title;
  for (const t of LEVEL_TITLES) {
    if (level >= t.min) title = t.title;
  }
  return title;
}

export function levelInfoFromTotal(totalXp: number): LevelInfo {
  let level = 1;
  let levelStart = 0;
  for (;;) {
    const need = xpForLevel(level);
    if (totalXp < levelStart + need) break;
    levelStart += need;
    level += 1;
    if (level > 500) break; // safety
  }
  const need = xpForLevel(level);
  return {
    level,
    title: titleForLevel(level),
    levelStartXp: levelStart,
    nextLevelXp: levelStart + need,
    progress: need > 0 ? Math.max(0, Math.min(1, (totalXp - levelStart) / need)) : 0,
  };
}

// ─── Storage ─────────────────────────────────────────────────────────────

export async function loadXp(): Promise<XpState> {
  try {
    const raw = await AsyncStorage.getItem(XP_KEY);
    const parsed = raw ? (JSON.parse(raw) as XpState) : null;
    return { totalXp: parsed?.totalXp ?? 0 };
  } catch {
    return { totalXp: 0 };
  }
}

export async function saveXp(state: XpState): Promise<void> {
  try {
    await AsyncStorage.setItem(XP_KEY, JSON.stringify(state));
  } catch {}
}

/**
 * Applies an XP delta against a GIVEN pre-read state (used inside the lock) —
 * level-up detection + Skill Point payout + level-up event live here so every
 * XP path flows through one door. @internal
 */
async function grantXpFromState(state: XpState, amount: number): Promise<number> {
  if (amount === 0) return 0;
  try {
    const before = levelInfoFromTotal(state.totalXp);
    const next = amount > 0 ? state.totalXp + amount : Math.max(0, state.totalXp + amount);
    const after = levelInfoFromTotal(next);
    await saveXp({ totalXp: Math.max(0, next) });
    if (after.level > before.level) {
      emitGameEvent({ type: 'levelup', level: after.level, title: after.title });
      const skill = await import('./skillService');
      const newLevels = Math.min(after.level - before.level, 50);
      if (newLevels > 0) await skill.grantSp(newLevels * SP_PER_LEVEL);
      // (sound is played by the app-level subscriber in HabitContext)
      // 📬 Mailbox: a letter per ceremony — with a little coin gift attached.
      try {
        const mail = await import('./mailboxService');
        await mail.addMail({
          kind: 'levelup',
          icon: '⭐',
          title: `Level ${after.level} reached — ${after.title}!`,
          body:
            `The portrait sharpens as you climb. This level-up credited ` +
            `+${newLevels} Skill Point${newLevels !== 1 ? 's' : ''} — spend ${newLevels !== 1 ? 'them' : 'it'} on the Skill Trees (HQ → Skill Trees) to grow your build. Next milestone keeps the portrait evolving.`,
          coinReward: 5,
        });
      } catch {}
    }
  } catch {}
  return Math.max(0, Math.round(amount));
}

/**
 * Raw XP credit (no multiplier). Serialized: two concurrent grants (habit
 * completion + quest payout landing in the same tick) both read the
 * pre-grant wallet and the later save silently dropped the earlier grant.
 */
export async function grantXp(amount: number): Promise<number> {
  try {
    return await withLock(LOCK_KEYS.xp, async () => {
      const state = await loadXp();
      return grantXpFromState(state, amount);
    });
  } catch {}
  return Math.max(0, Math.round(amount));
}

/**
 * Clamped wallet adjustment used by every refund/claw-back path (un-complete
 * refunds, mood downgrades, drip step-backs) — runs inside the XP lock so it
 * can never race a concurrent grant.
 */
export async function applyXpDelta(delta: number): Promise<void> {
  if (delta === 0) return;
  await withLock(LOCK_KEYS.xp, async () => {
    const state = await loadXp();
    await saveXp({ totalXp: Math.max(0, state.totalXp + delta) });
  });
}

/**
 * Multiplied bonus grant: skill tree × prestige × XP Storm × difficulty earn
 * scaling. Returns the stored grant. Every "player earned XP" path should
 * flow through here so the difficulty knob always applies.
 */
export async function grantXpBonus(amount: number, _label = ''): Promise<{ total: number }> {
  try {
    const skill = await import('./skillService');
    const prestige = await import('./prestigeService');
    const economy = await import('./economyService');
    const mult = ((await skill.xpMult()) || 1)
      * ((await prestige.xpBonusMultAsync()) || 1)
      * ((await economy.xpBoostMult()) || 1)
      * xpEarnMult();
    const total = Math.max(0, Math.round(amount * mult));
    await grantXp(total);
    return { total };
  } catch {
    const total = Math.max(0, Math.round(amount));
    await grantXp(total);
    return { total };
  }
}

async function grantXpBonusSafe(amount: number, label: string): Promise<void> {
  const res = await grantXpBonus(amount, label);
  emitGameEvent({ type: 'claim', message: label, xp: res.total });
}

/** Kept for the GameToast 'achievement' channel (challenge wins etc.). */
export function emitAchievementToast(title: string): void {
  emitGameEvent({ type: 'achievement', title });
}

// ─── XP formula ──────────────────────────────────────────────────────────

const XP_DIFFICULTY = { easy: 8, medium: 12, hard: 18 } as const;

export function completionXpFor(habit: Habit, streak: number, mood?: CompletionMood, streakCap = 50): number {
  const base = XP_DIFFICULTY[(habit.difficulty ?? 'medium') as keyof typeof XP_DIFFICULTY] ?? 12;
  const priorityMultiplier = 1 + (Math.min(Math.max(habit.priority ?? 5, 1), 10) - 1) * 0.05;
  const streakBonus = Math.min(streak, streakCap) * 0.01;
  const moodBonus = GAME_RULES.moodBonus[mood ?? 'ok'] ?? 0;
  return Math.round(base * priorityMultiplier * (1 + streakBonus)) + moodBonus;
}

/** Drip XP for partial quantity progress before the target is reached. */
function quantityStepXp(count: number, target: number, cap: number): number {
  return count < target ? Math.min(count, cap) : 0; // 1 XP per unit up to the skill cap
}

// ─── Completion pipeline (called from the in-app toggle & notifications) ──

interface Snapshot {
  habits: Habit[];
  completions: HabitCompletion[];
}

async function fetchSnapshot(): Promise<Snapshot> {
  const service = await import('./habitService');
  const [habits, completions] = await Promise.all([service.loadHabits(), service.loadCompletions()]);
  return { habits, completions };
}

async function saveRecord(record: HabitCompletion, _snapshot: Snapshot): Promise<void> {
  const service = await import('./habitService');
  // Re-merge against the LATEST on-disk array while holding the write lock.
  // The snapshot was taken at pipeline start and goes stale across the many
  // awaits before this runs — saving it back used to erase completions that
  // landed in the meantime (second habit, notification "Done ✓" tap).
  await withLock(LOCK_KEYS.completions, async () => {
    const fresh = await service.loadCompletions();
    const idx = fresh.findIndex((c) => c.key === record.key);
    if (idx >= 0) {
      // Merge ONLY the XP pipeline-owned fields, and only the ones this call
      // actually set. Spreading the whole snapshot record overwrote fresher
      // toggle state (completed/count/completedAt): a rapid complete →
      // un-complete ended with the day marked completed again after the
      // user's last action was un-complete, XP/coins already paid.
      const patch: Partial<HabitCompletion> = {};
      if (record.xp !== undefined) patch.xp = record.xp;
      if (record.moodXp !== undefined) patch.moodXp = record.moodXp;
      if (record.dripXp !== undefined) patch.dripXp = record.dripXp;
      if (record.coins !== undefined) patch.coins = record.coins;
      if (record.mood !== undefined) patch.mood = record.mood;
      fresh[idx] = { ...fresh[idx], ...patch };
    } else {
      // Guard against duplicates: an interleaved writer may have created
      // this key already (different object) — update it instead of pushing.
      fresh.push(record);
    }
    await service.saveCompletions(fresh.filter((c, i, arr) => arr.findIndex((x) => x.key === c.key) === i));
  });
}

/**
 * XP-side of every habit completion/un-completion. Handles: base XP
 * (difficulty × priority × streak multiplier × skill/prestige bonuses),
 * deductions on un-complete, mood bonus, streak-milestone rewards,
 * boss bonuses, perfect-day bonus, coin income (+combo), HP healing,
 * rebuild missions, daily quest claims and achievement checks.
 */
export async function onHabitToggled(habitId: string, date: string, completed: boolean): Promise<void> {
  try {
    const snapshot = await fetchSnapshot();
    const habit = snapshot.habits.find((h) => h.id === habitId);
    if (!habit) return;

    const key = `${habitId}_${date}`;
    const record = snapshot.completions.find((c) => c.key === key);
    if (!record) return;

    if (!completed) {
      // The day was "un-done": exact refunds, never more than was granted.
      const xpRefund = (record.xp ?? 0) + (record.moodXp ?? 0) + (record.dripXp ?? 0);
      const coinRefund = record.coins ?? 0;
      record.xp = 0;
      record.moodXp = 0;
      record.dripXp = 0;
      record.coins = 0;
      await saveRecord(record, snapshot);
      if (xpRefund > 0) {
        await applyXpDelta(-xpRefund);
      }
      if (coinRefund > 0) {
        const economy = await import('./economyService');
        // Coins must LEAVE the wallet here — earnCoins() would re-add them
        // and turn a complete → un-complete toggle into an infinite coin
        // printer. revokeCoins() is the exact inverse of the grant: no
        // lifetimeEarned / lifetimeSpent side-effects.
        await economy.revokeCoins(coinRefund, 'Un-complete refund');
      }
      return;
    }

    const hpSvc = await import('./hpService');
    const hpState = await hpSvc.getHabitHp(habitId);
    if (hpState.collapsedAt) {
      // Hibernating habits earn nothing — but a completed day IS the FREE
      // rebuild path promised in the mailbox: fill the mission 🧱 → free
      // revive. No XP / coins / HP here, only mission progress (idempotent).
      const penaltySvc = await import('./penaltyService');
      await penaltySvc.progressRebuildMissions(habitId, habit.name, date);
      return;
    }

    if (record.xp && record.xp > 0) return; // already granted (idempotent)

    // Full completion pays the FULL day's XP — return any drip XP that the
    // partial quantity steps already granted. The in-app step-up path does
    // this in onQuantityStep, but a notification "Done ✓" (fillQuantity)
    // lands here directly, so the leftover drip would stack on top.
    if ((record.dripXp ?? 0) > 0) {
      const drip = record.dripXp ?? 0;
      record.dripXp = 0;
      await saveRecord(record, snapshot);
      await applyXpDelta(-drip);
    }

    // Credited keys — quantity habits with ANY progress (count ≥ 1) count as
    // done: partial progress never breaks a streak.
    const doneKeys = new Set(
      snapshot.completions.filter((c) => c.completed || (c.count ?? 0) > 0).map((c) => c.key)
    );
    const freezeStoreRef = await import('./streakService');
    const store = await freezeStoreRef.loadFreezeStore();
    const streak = computeHabitStreak(habit, doneKeys, date, frozenDatesForHabit(store, habitId));

    // ── Base XP ── (stored on the record; exactly that is refunded later)
    // The mood bonus must NOT ride inside the base grant: it lives in
    // record.moodXp and is paid by the post-completion mood sheet
    // (onMoodSelected). Feeding a persisted record.mood here double-pays it
    // on an un-complete → re-complete loop (refund zeroes moodXp, the sheet
    // then pays the bonus again on top of the already-embedded one).
    const skillPre = await import('./skillService');
    const streakCapXp = await skillPre.streakXpCap();
    const gained = await grantXpBonus(completionXpFor(habit, streak, undefined, streakCapXp));
    record.xp = gained.total;
    await saveRecord(record, snapshot);

    // ── Coin income + combo chain (Midas ×2 lands on top) ──
    try {
      const economy = await import('./economyService');
      const skill = await import('./skillService');
      const combo = await economy.registerCompletionForCombo(date);
      const boost = await economy.useCoinBoostIfActive();
      const coinMult = await skill.coinMult();
      const flatCoins = await skill.coinFlat();
      const base =
        ECONOMY_RULES.coinEarn[(habit.difficulty ?? 'medium') as keyof typeof ECONOMY_RULES.coinEarn] ?? 6;
      const capDays = await skill.streakBonusCapDays();
      const perDayRate = await skill.streakBonusPerDayRate();
      const streakBonusMult = 1 + Math.min(streak, capDays) * perDayRate;
      const coins = Math.max(1, Math.round(
        base * streakBonusMult * coinMult * combo.appliedMultiplier * coinEarnMult()
          * (boost === 'x3' ? 3 : boost === 'x2' ? 2 : 1)
      )) + flatCoins;
      await economy.earnCoins(coins, 'Habit beat', { silent: true });
      record.coins = coins;
      await saveRecord(record, snapshot);
    } catch {}

    // ── HP heal (claim-guarded — once per habit-day) ──
    await hpSvc.healOnCompletion(habitId, date);

    // ── Rebuild missions 🧱 ──
    try {
      const penaltySvc = await import('./penaltyService');
      await penaltySvc.progressRebuildMissions(habitId, habit.name, date);
    } catch {}

    // ── Evolution 🌱→✨ (stage-up rewards are claim-keyed, never revoked) ──
    try {
      const evo = await import('./evolutionService');
      await evo.evaluateEvolution(habitId, habit.name, snapshot.completions);
    } catch {}

    // ── Streak milestone rewards (7 / 30 / 100 …) ──
    const milestoneXp = GAME_RULES.milestoneXp[streak];
    if (milestoneXp && (await claimReward(`streak_${habitId}_${streak}`, new Date().toISOString()))) {
      const skill = await import('./skillService');
      const boosted = Math.round(milestoneXp * ((await skill.milestoneXpMult()) || 1));
      const res = await grantXpBonus(boosted, `🔥 ${streak}-day streak!`);
      emitGameEvent({
        type: 'claim',
        message: `🔥 ${streak}-day streak reward!`,
        xp: res.total,
      });
    }

    // ── Boss bonus ──
    const quests = await import('./questsService');
    const boss = await quests.pickBossForDate(date);
    if (boss && boss.id === habitId) {
      if (await claimReward(`boss_${date}`, new Date().toISOString())) {
        const skill = await import('./skillService');
        const boosted = Math.round(GAME_RULES.bossBonusXp * ((await skill.bossXpMult()) || 1));
        await grantXpBonusSafe(boosted, `🐉 Boss defeated: ${habit.name}!`);
      }
    }

    // ── Perfect-day bonus ──
    if (isDayPerfect(snapshot.habits, snapshot.completions, date)) {
      if (await claimReward(`perfect_${date}`, new Date().toISOString())) {
        const skill = await import('./skillService');
        const boosted = Math.round(GAME_RULES.perfectDayXp * ((await skill.perfectXpMult()) || 1));
        await grantXpBonusSafe(boosted, '🎉 Perfect day!');
      }
    }

    // ── Daily quests ──
    await quests.evaluateQuestClaims(date);

    // ── Legend skills (arena checks — raids / challenges / seasons) ──
    await legendCheck();
  } catch {}
}

/**
 * Quantity habit progress: small drip XP for stepping partially forward,
 * full completion pipeline when the target is finally reached.
 *
 * Drip XP is stored in `record.dripXp` — deliberately OUT of `record.xp` so a
 * leftover drip can never masquerade as "already granted" and block the full
 * completion pipeline when the target is reached. Drip grows with the count
 * (`min(count, cap)` units × 1 XP); stepping backwards claws the delta back.
 */
export async function onQuantityStep(
  habitId: string,
  date: string,
  result: { started: boolean; justCompleted: boolean; justUncompleted: boolean; count: number }
): Promise<void> {
  try {
    if (result.justCompleted) {
      // Full completion pays the FULL day's XP — so any drip XP already
      // granted on the way (stored in record.dripXp, separate from record.xp)
      // is returned to the wallet. Without this the day double-pays: drip
      // while stepping up, then the completion bonus on top.
      try {
        const snapshot = await fetchSnapshot();
        const record = snapshot.completions.find((c) => c.key === `${habitId}_${date}`);
        const drip = record?.dripXp ?? 0;
        if (record && drip > 0) {
          record.dripXp = 0;
          await saveRecord(record, snapshot);
          await applyXpDelta(-drip);
        }
      } catch {}
      await onHabitToggled(habitId, date, true);
      return;
    }
    if (result.justUncompleted) {
      await onHabitToggled(habitId, date, false);
      return;
    }
    if (result.started || result.count > 0) {
      const snapshot = await fetchSnapshot();
      const habit = snapshot.habits.find((h) => h.id === habitId);
      if (!habit?.targetCount) return;

      // Hibernating habits earn nothing — not even drip.
      const hpSvc = await import('./hpService');
      if ((await hpSvc.getHabitHp(habitId)).collapsedAt) return;

      const skillMod = await import('./skillService');
      const cap = await skillMod.dripCap();
      const totalDrip = quantityStepXp(result.count, habit.targetCount, cap);
      const key = `${habitId}_${date}`;
      const record = snapshot.completions.find((c) => c.key === key);
      if (record && totalDrip !== (record.dripXp ?? 0)) {
        const delta = totalDrip - (record.dripXp ?? 0);
        record.dripXp = totalDrip;
        await saveRecord(record, snapshot);
        if (delta > 0) {
          await grantXp(delta);
        } else {
          // Stepped backwards — claw the over-granted drip back.
          await applyXpDelta(delta);
        }
      }
    }
  } catch {}
}

/** Called when the user picks a mood in the post-completion sheet. */
export async function onMoodSelected(habitId: string, date: string, mood: CompletionMood): Promise<void> {
  try {
    const snapshot = await fetchSnapshot();
    const habit = snapshot.habits.find((h) => h.id === habitId);
    if (!habit) return;

    const hpSvc = await import('./hpService');
    if ((await hpSvc.getHabitHp(habitId)).collapsedAt) {
      // Hibernating habits earn nothing — store the mood, pay no bonus.
      await (await import('./habitService')).setMoodForCompletion(habitId, date, mood);
      return;
    }

    const key = `${habitId}_${date}`;
    const record = snapshot.completions.find((c) => c.key === key);
    if (!record) return;

    const service = await import('./habitService');
    const prevBonus = record.moodXp ?? 0;
    const base = GAME_RULES.moodBonus[mood] ?? 0;
    const skill = await import('./skillService');
    // Empathy path: each Empathy-tier node adds +1 XP on top of a real bonus.
    const empathy = base > 0 ? Math.min(2, await skill.moodBonusFlat()) : 0;
    const newBonus = base + empathy;
    const delta = newBonus - prevBonus;

    record.mood = mood;
    record.moodXp = newBonus;
    await saveRecord(record, snapshot);
    await service.setMoodForCompletion(habitId, date, mood);
    if (delta > 0) {
      await grantXp(delta);
    } else if (delta < 0) {
      // Downgrade: claw the over-granted mood bonus back — the drip path does
      // the same, and un-complete refunds use the (now lowered) moodXp, so
      // skipping this would leave the bonus permanently in the wallet.
      await applyXpDelta(delta);
    }
    await legendCheck();
  } catch {}
}

/** Legend skills check — idempotent, cheap when nothing new is earned. */
async function legendCheck(): Promise<void> {
  try {
    const skill = await import('./skillService');
    await skill.checkLegendSkills();
  } catch {}
}

/** Full sub-habit checklist finished → one-time bonus per day. */
export async function onSubHabitListChanged(habitId: string, date: string, allDone: boolean): Promise<void> {
  try {
    if (allDone && (await claimReward(`suball_${habitId}_${date}`, new Date().toISOString()))) {
      const skill = await import('./skillService');
      const boosted = Math.round(GAME_RULES.subHabitAllDoneXp * ((await skill.subHabitXpMult()) || 1));
      const res = await grantXpBonus(boosted, '✅ Checklist complete!');
      emitGameEvent({ type: 'claim', message: '✅ Checklist complete!', xp: res.total });
    }
    if (allDone) {
      await legendCheck();
    }
  } catch {}
}

/** Used by quest evaluation to hand out XP for newly-finished quests. */
export async function grantQuestReward(message: string, xp: number): Promise<void> {
  let mult = 1;
  try {
    const skill = await import('./skillService');
    mult = await skill.questXpMult();
  } catch {}
  const res = await grantXpBonus(Math.max(1, Math.round(xp * mult)), message);
  emitGameEvent({ type: 'claim', message, xp: res.total });
}

/** Comeback-king progress source. */
export async function freezesEverUsed(): Promise<number> {
  try {
    return await lifetimeFreezesUsed();
  } catch {
    return 0;
  }
}

/** Simple accessor used by UI (profile card). */
export async function loadTotalXp(): Promise<number> {
  try {
    return (await loadXp()).totalXp;
  } catch {
    return 0;
  }
}
