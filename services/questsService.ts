import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit, HabitCompletion, GAME_RULES } from './types';
import { isHabitActiveOnDate, todayStr } from './recurrenceService';

const QUEST_CLAIMS_KEY = '@habit_planner_quest_state';

export type QuestTier = 'easy' | 'medium' | 'hard' | 'secret';

export interface DailyQuest {
  id: string;
  label: string;
  icon: string;       // MaterialIcons name
  reward: number;
  done: boolean;
  claimed: boolean;
  tier?: QuestTier;
}

export interface QuestState {
  claims: Record<string, string>;   // `${questId}_${date}` → ISO claimed-at
}

export async function loadQuestState(): Promise<QuestState> {
  try {
    const raw = await AsyncStorage.getItem(QUEST_CLAIMS_KEY);
    const parsed = raw ? (JSON.parse(raw) as QuestState) : null;
    return { claims: parsed?.claims ?? {} };
  } catch {
    return { claims: {} };
  }
}

async function saveQuestState(state: QuestState): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEST_CLAIMS_KEY, JSON.stringify(state));
  } catch {}
}

function questClaimedKey(id: string, date: string): string {
  return `${id}_${date}`;
}

/**
 * Boss habit of a day: the hardest active habit (difficulty 'hard' first,
 * then higher priority, then older). Deterministic so the same boss shows
 * all day long. Undefined means "no boss today".
 */
export function pickBossFromHabits(habits: Habit[], date: string): Habit | null {
  const active = habits.filter(
    (h) => !h.archived && isHabitActiveOnDate(h, date) && h.targetCount !== 0
  );
  if (active.length === 0) return null;
  const sorted = [...active].sort((a, b) => {
    const diffA = a.difficulty === 'hard' ? 1 : 0;
    const diffB = b.difficulty === 'hard' ? 1 : 0;
    if (diffA !== diffB) return diffB - diffA;
    if ((b.priority ?? 5) !== (a.priority ?? 5)) return (b.priority ?? 5) - (a.priority ?? 5);
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  });
  return sorted[0] ?? null;
}

export async function pickBossForDate(date: string): Promise<Habit | null> {
  try {
    const service = await import('./habitService');
    const habits = await service.loadHabits();
    return pickBossFromHabits(habits, date);
  } catch {
    return null;
  }
}

function hashDate(date: string): number {
  let h = 0;
  for (let i = 0; i < date.length; i++) {
    h = (h * 31 + date.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Daily quest board: 1 rotated easy + fixed medium + fixed hard sprint
 * (plus the boss when one exists), and a secret 🔒 quest that only reveals
 * its payout after everything else is claimed on a perfect day.
 */
export async function getDailyQuests(
  habits: Habit[],
  completions: HabitCompletion[],
  date: string
): Promise<DailyQuest[]> {
  const boss = pickBossFromHabits(habits, date);
  const bossDone = boss
    ? completions.some((c) => c.habitId === boss.id && c.date === date && (c.completed || (c.count ?? 0) > 0))
    : true;

  const pool: Omit<DailyQuest, 'done' | 'claimed'>[] = [
    { id: 'q_three', label: 'Complete 3 habits today', icon: 'done-all', reward: GAME_RULES.questRewardXp, tier: 'easy' },
    { id: 'q_boss', label: boss ? `Defeat the boss: ${boss.name}` : 'Boss battle', icon: 'sports-mma', reward: GAME_RULES.bossBonusXp, tier: 'hard' },
    { id: 'q_morning', label: 'First completion before 9 AM', icon: 'wb-sunny', reward: GAME_RULES.questRewardXp, tier: 'easy' },
    { id: 'q_streak5', label: 'Hold a 5-day streak on any habit', icon: 'local-fire-department', reward: GAME_RULES.mediumQuestXp, tier: 'medium' },
    { id: 'q_five', label: 'Complete 5 habits today', icon: 'military-tech', reward: GAME_RULES.hardQuestXp, tier: 'hard' },
  ];

  // Daily line-up (deterministic — same board shows all day long):
  //   1 rotated easy  +  1 fixed medium  +  1 fixed hard sprint
  //   (+ boss when one exists). A secret 🔒 quest is appended: it only pays
  //   once every visible quest is claimed AND the day was finished perfectly.
  const rotation = hashDate(date);
  const easyPool = pool.filter((q) => q.tier === 'easy');
  const easyPick = easyPool[rotation % easyPool.length]!;
  const medPick = pool.find((q) => q.id === 'q_streak5')!;
  const hardPick = pool.find((q) => q.id === 'q_five')!;
  const questDefs: Omit<DailyQuest, 'done' | 'claimed'>[] = [
    easyPick,
    medPick,
    hardPick,
    ...(boss ? [pool.find((q) => q.id === 'q_boss')!] : []),
    { id: 'q_secret', label: 'Secret quest', icon: 'lock', reward: GAME_RULES.secretQuestXp, tier: 'secret' },
  ];

  // Done-detection from today's data. Quantity habits count as done with ANY
  // progress (count ≥ 1) — one partial day is one credited habit.
  const todays = completions.filter((c) => c.date === date && (c.completed || (c.count ?? 0) > 0));
  const earlyBirdDone = todays.some((c) => (c.completedAt ? new Date(c.completedAt).getHours() < 9 : false));
  const counts = new Map<string, number>();
  todays.forEach((c) => counts.set(c.habitId, (counts.get(c.habitId) ?? 0) + 1));
  const threeDone = counts.size >= 3;
  const fiveDone = counts.size >= 5;

  // 5-day streak probe on any live habit.
  let anyStreakFive = false;
  try {
    const streakMod = await import('./streakService');
    const doneKeys = new Set(completions.filter((c) => c.completed || (c.count ?? 0) > 0).map((c) => c.key));
    const freezeStore = await streakMod.loadFreezeStore();
    for (const h of habits.filter((x) => !x.archived && isHabitActiveOnDate(x, date))) {
      const s = streakMod.computeHabitStreak(
        h,
        doneKeys,
        date,
        streakMod.frozenDatesForHabit(freezeStore, h.id)
      );
      if (s >= 5) { anyStreakFive = true; break; }
    }
  } catch {}

  const state = await loadQuestState();

  // Boss payout state lives in the XP claims store (`boss_<date>`), so the
  // secret quest's "everything claimed" gate mirrors it from there.
  let bossPaid = false;
  if (boss) {
    try {
      const xp = await import('./xpService');
      bossPaid = await xp.isClaimed(`boss_${date}`);
    } catch {}
  }
  const visibleAllClaimed = questDefs
    .filter((q) => q.id !== 'q_secret')
    .every((q) => (q.id === 'q_boss' ? boss ? bossPaid : true : !!state.claims[questClaimedKey(q.id, date)]));

  // Secret unlocks only if the whole day was cleared while it was still the
  // same day — a perfect finish after 10 PM keeps the mystery for tomorrow.
  const earlySecretReady = date === todayStr() ? new Date().getHours() < 20 : true;
  const secretDone = visibleAllClaimed && isPerfectDayNow(habits, completions, date) && earlySecretReady;

  return questDefs.map((def) => {
    const done =
      def.id === 'q_boss'
        ? bossDone
        : def.id === 'q_secret'
          ? secretDone
          : def.id === 'q_morning'
            ? earlyBirdDone
            : def.id === 'q_streak5'
              ? anyStreakFive
              : def.id === 'q_five'
                ? fiveDone
                : threeDone || counts.size >= 3;
    return {
      ...def,
      label: def.id === 'q_boss' && !boss ? 'No boss today' : def.label,
      done,
      claimed: def.id === 'q_boss' && boss ? bossPaid : !!state.claims[questClaimedKey(def.id, date)],
    };
  });
}

function isPerfectDayNow(habits: Habit[], completions: HabitCompletion[], date: string): boolean {
  const active = habits.filter((h) => !h.archived && isHabitActiveOnDate(h, date));
  if (active.length === 0) return false;
  const doneIds = new Set(
    completions.filter((c) => c.date === date && (c.completed || (c.count ?? 0) > 0)).map((c) => c.habitId)
  );
  return active.every((h) => doneIds.has(h.id));
}

/**
 * Awards XP for quest completions not yet claimed. Called from the XP
 * pipeline after every completion, and whenever the quests card mounts.
 */
export async function evaluateQuestClaims(date: string): Promise<void> {
  try {
    const service = await import('./habitService');
    const xp = await import('./xpService');
    const [habits, completions] = await Promise.all([
      service.loadHabits(),
      service.loadCompletions(),
    ]);
    const quests = await getDailyQuests(habits, completions, date);
    const state = await loadQuestState();
    let changed = false;

    for (const q of quests) {
      if (!q.done) continue;
      if (q.id === 'q_boss') {
        // The boss bonus is claimed by the XP pipeline itself (`boss_<date>`)
        // — never double-pay here. Only mirror the claimed state for the UI.
        q.claimed = await xp.isClaimed(`boss_${date}`);
        continue;
      }
      if (!q.claimed && (await xp.claimReward(`quest_${q.id}_${date}`, new Date().toISOString()))) {
        state.claims[questClaimedKey(q.id, date)] = new Date().toISOString();
        changed = true;
        const message =
          q.id === 'q_secret'
            ? '🔒 Secret quest cleared — the perfect day!'
            : `🎯 Quest complete: ${q.label}`;
        await xp.grantQuestReward(message, q.reward);
      }
    }
    if (changed) {
      await saveQuestState(state);
    }
  } catch {}
}

/** Convenience for screens that only need today's data. */
export async function getTodayQuests(): Promise<{ quests: DailyQuest[]; boss: Habit | null }> {
  try {
    const service = await import('./habitService');
    const [habits, completions] = await Promise.all([
      service.loadHabits(),
      service.loadCompletions(),
    ]);
    const boss = pickBossFromHabits(habits, todayStr());
    const quests = await getDailyQuests(habits, completions, todayStr());
    return { quests, boss };
  } catch {
    return { quests: [], boss: null };
  }
}
