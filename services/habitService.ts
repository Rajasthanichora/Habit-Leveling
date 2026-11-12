// Powered by OnSpace.AI
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit, HabitCompletion, SortConfig, ReminderConfig, ReminderRepeatMode, Section, CategoryDef, NotificationSettings, DEFAULT_NOTIFICATION_SETTINGS, CompletionMood } from './types';
import { cancelSchedulesByHabit } from './notificationService';
import { withLock, LOCK_KEYS } from './writeLock';

const HABITS_KEY = '@habit_planner_habits';
const COMPLETIONS_KEY = '@habit_planner_completions';
const SORT_KEY = '@habit_planner_sort';
const REMINDERS_KEY = '@habit_planner_reminders';
const SECTIONS_KEY = '@habit_planner_sections';

// ─── Habits ──────────────────────────────────────────────────────────────────

export async function loadHabits(): Promise<Habit[]> {
  try {
    const raw = await AsyncStorage.getItem(HABITS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveHabits(habits: Habit[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HABITS_KEY, JSON.stringify(habits));
  } catch {}
}

export async function addHabit(habit: Habit): Promise<void> {
  const habits = await loadHabits();
  habits.push(habit);
  await saveHabits(habits);
}

export async function updateHabit(updated: Habit): Promise<void> {
  const habits = await loadHabits();
  const idx = habits.findIndex((h) => h.id === updated.id);
  if (idx >= 0) {
    habits[idx] = updated;
    await saveHabits(habits);
  }
}

export async function deleteHabit(id: string): Promise<void> {
  const habits = await loadHabits();
  await saveHabits(habits.filter((h) => h.id !== id));
}

/**
 * Removes everything that belonged to a deleted habit: completion history,
 * saved reminders and any still-scheduled notification for this session.
 * Without this the deleted habit leaves orphaned rows in storage (and a
 * notification that keeps firing until the next app start re-sync).
 */
export async function purgeHabitData(habitId: string): Promise<void> {
  try {
    await withLock(LOCK_KEYS.completions, async () => {
      const completions = await loadCompletions();
      const keptCompletions = completions.filter((c) => c.habitId !== habitId);
      if (keptCompletions.length !== completions.length) {
        await saveCompletions(keptCompletions);
      }
    });
  } catch {}

  try {
    await deleteRemindersForHabit(habitId);
  } catch {}

  // Drop the habit's sub-habit check state.
  try {
    const map = await loadSubTodoMap();
    const kept: Record<string, string[]> = {};
    Object.entries(map).forEach(([key, ids]) => {
      if (!key.startsWith(`${habitId}_`)) kept[key] = ids;
    });
    await saveSubTodoMap(kept);
  } catch {}

  // Drop the habit's game-layer data: HP state, rebuild missions.
  try {
    const hp = await import('./hpService');
    await hp.purgeHabitHp(habitId);
  } catch {}
  try {
    const penalty = await import('./penaltyService');
    await penalty.purgePenaltyData(habitId);
  } catch {}

  try {
    await cancelSchedulesByHabit(habitId);
  } catch {}
}

// ─── Completions ─────────────────────────────────────────────────────────────

export async function loadCompletions(): Promise<HabitCompletion[]> {
  try {
    const raw = await AsyncStorage.getItem(COMPLETIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCompletions(completions: HabitCompletion[]): Promise<void> {
  try {
    await AsyncStorage.setItem(COMPLETIONS_KEY, JSON.stringify(completions));
  } catch {}
}

/**
 * A quantity habit with ANY progress (count ≥ 1) is credited as done for its
 * day — it never counts as a miss. `record.completed` stays false until the
 * target is reached (that's the "full completion reward" flag), but the day
 * still counts everywhere the game looks at done work.
 */
export function isDayCredited(record: HabitCompletion): boolean {
  return record.completed || (record.count ?? 0) > 0;
}

/** Credited habit ids for one date — `completed` records, plus quantity records with any progress. */
export function creditedDoneIds(completions: HabitCompletion[], date: string): Set<string> {
  const out = new Set<string>();
  completions.forEach((c) => {
    if (c.date === date && isDayCredited(c)) out.add(c.habitId);
  });
  return out;
}

/** Credited completion keys across all dates — for streak engines. */
export function creditedDoneKeys(completions: HabitCompletion[]): Set<string> {
  const out = new Set<string>();
  completions.forEach((c) => {
    if (isDayCredited(c)) out.add(c.key);
  });
  return out;
}

export async function toggleCompletion(habitId: string, date: string): Promise<boolean> {
  // Serialized: two taps racing would both miss `existing` and push two
  // records with the same key (double XP credit) — the lock keeps the
  // read-modify-write atomic.
  return withLock(LOCK_KEYS.completions, async () => {
    const completions = await loadCompletions();
    const key = `${habitId}_${date}`;
    const existing = completions.find((c) => c.key === key);
    if (existing) {
      existing.completed = !existing.completed;
      await saveCompletions(completions);
      return existing.completed;
    } else {
      completions.push({ key, habitId, date, completed: true, completedAt: new Date().toISOString() });
      await saveCompletions(completions);
      return true;
    }
  });
}

/**
 * Marks a habit complete for `date` without toggling — used by the "Done"
 * action on system notifications so a double-tap never un-completes.
 */
export async function markCompletion(habitId: string, date: string, target?: number): Promise<boolean> {
  // Serialized for the same reason as toggleCompletion: "Done ✓" from a
  // notification can race an in-app tap.
  return withLock(LOCK_KEYS.completions, async () => {
    const completions = await loadCompletions();
    const key = `${habitId}_${date}`;
    const existing = completions.find((c) => c.key === key);
    if (existing) {
      if (!existing.completed) {
        existing.completed = true;
        existing.completedAt = new Date().toISOString();
        // Never leave a quantity record without `count` — `stepQuantity`
        // reads a missing count as "already at target", which would make the
        // next in-app tap jump straight to the target.
        if (target != null && target > 0 && existing.count == null) {
          existing.count = Math.max(existing.count ?? 0, target);
        }
        await saveCompletions(completions);
      }
      return true;
    }
    completions.push({
      key,
      habitId,
      date,
      completed: true,
      completedAt: new Date().toISOString(),
      ...(target != null && target > 0 ? { count: target } : {}),
    });
    await saveCompletions(completions);
    return true;
  });
}

/**
 * Stores the user's mood for a completion. XP already granted for the base
 * completion — the mood bonus is applied by the XP service afterwards.
 */
export async function setMoodForCompletion(
  habitId: string,
  date: string,
  mood: CompletionMood
): Promise<void> {
  try {
    // Merge against a fresh read while holding the lock — the XP pipeline
    // (xp/dripXp fields) may be writing the same record concurrently.
    await withLock(LOCK_KEYS.completions, async () => {
      const completions = await loadCompletions();
      const record = completions.find((c) => c.key === `${habitId}_${date}`);
      if (record) {
        record.mood = mood;
        await saveCompletions(completions);
      }
    });
  } catch {}
}

// ─── Quantity Habits ("8 glasses of water") ───────────────────────────────

export interface QuantityStepResult {
  count: number;
  completed: boolean;
  /** true when crossed 0→1 (a fresh task-day record appeared). */
  started: boolean;
  /** true when the target was reached with this step. */
  justCompleted: boolean;
  /** true when the record went from completed → not completed (minus XP path). */
  justUncompleted: boolean;
  /** true when the record was removed (count back to 0). */
  removed: boolean;
}

/**
 * Adds/removes one unit of progress toward `habit.targetCount`. The record is
 * deleted again when the count falls back to 0 so empty days never linger.
 */
export async function stepQuantity(
  habitId: string,
  date: string,
  delta: number,
  target: number
): Promise<QuantityStepResult> {
  // Serialized so two rapid taps (or a notification + tap race) can't both
  // read the same count and lose a unit or double-pipeline the completion.
  return withLock(LOCK_KEYS.completions, async () => {
    const completions = await loadCompletions();
    const key = `${habitId}_${date}`;
    const idx = completions.findIndex((c) => c.key === key);
    const current = idx >= 0 ? (completions[idx].count ?? (completions[idx].completed ? target : 0)) : 0;
    // Tapping "−" with nothing recorded is a no-op — the fall-through below
    // would push a count:0/completed:false phantom row for the day (the
    // "empty days never linger" invariant also covers never creating one).
    if (idx < 0 && delta < 0) {
      return {
        count: 0,
        completed: false,
        started: false,
        justCompleted: false,
        justUncompleted: false,
        removed: false,
      };
    }
    let next = Math.max(0, Math.min(target, current + (delta > 0 ? 1 : -1)));
    const wasCompleted = idx >= 0 ? completions[idx].completed : false;

    if (idx >= 0 && next === 0) {
      completions.splice(idx, 1);
      await saveCompletions(completions);
      return {
        count: 0,
        completed: false,
        started: false,
        justCompleted: false,
        justUncompleted: wasCompleted,
        removed: true,
      };
    }

    next = Math.max(next, delta > 0 ? 1 : 0);
    const completed = next >= target;
    const result: QuantityStepResult = {
      count: next,
      completed,
      started: current === 0 && next > 0,
      justCompleted: !wasCompleted && completed,
      justUncompleted: wasCompleted && !completed,
      removed: false,
    };

    if (idx >= 0) {
      completions[idx].count = next;
      completions[idx].completed = completed;
    } else {
      completions.push({
        key,
        habitId,
        date,
        completed,
        completedAt: new Date().toISOString(),
        count: next,
      });
    }
    await saveCompletions(completions);
    return result;
  });
}

/** Marks a quantity habit's target fully reached (notification "Done" path). */
export async function fillQuantity(habitId: string, date: string, target: number): Promise<boolean> {
  try {
    return withLock(LOCK_KEYS.completions, async () => {
      const completions = await loadCompletions();
      const key = `${habitId}_${date}`;
      const existing = completions.find((c) => c.key === key);
      if (existing) {
        if (existing.count !== target || !existing.completed) {
          existing.count = target;
          existing.completed = true;
          existing.completedAt = new Date().toISOString();
          await saveCompletions(completions);
        }
        return true;
      }
      completions.push({
        key,
        habitId,
        date,
        completed: true,
        completedAt: new Date().toISOString(),
        count: target,
      });
      await saveCompletions(completions);
      return true;
    });
  } catch {
    return false;
  }
}

// ─── Sub-Habit Checklists ─────────────────────────────────────────────────

const SUBTODO_KEY = '@habit_planner_subtodo';

/** All sub-habit check state: key `${habitId}_${date}` → done sub-habit ids. */
export async function loadSubTodoMap(): Promise<Record<string, string[]>> {
  try {
    const raw = await AsyncStorage.getItem(SUBTODO_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveSubTodoMap(map: Record<string, string[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(SUBTODO_KEY, JSON.stringify(map));
  } catch {}
}

/** Toggles one checklist item; returns the updated done list for the day. */
export async function toggleSubHabit(habitId: string, date: string, subId: string): Promise<string[]> {
  try {
    const map = await loadSubTodoMap();
    const key = `${habitId}_${date}`;
    const done = new Set(map[key] ?? []);
    if (done.has(subId)) {
      done.delete(subId);
    } else {
      done.add(subId);
    }
    const list = Array.from(done);
    map[key] = list;
    await saveSubTodoMap(map);
    return list;
  } catch {
    return [];
  }
}

export async function getCompletionMap(date: string): Promise<Record<string, boolean>> {
  const completions = await loadCompletions();
  const map: Record<string, boolean> = {};
  completions
    .filter((c) => c.date === date && c.completed)
    .forEach((c) => {
      map[c.habitId] = true;
    });
  return map;
}

// ─── Sort Config ─────────────────────────────────────────────────────────────

export async function loadSortConfig(): Promise<SortConfig> {
  try {
    const raw = await AsyncStorage.getItem(SORT_KEY);
    return raw
      ? JSON.parse(raw)
      : { mode: 'global', sortBy: 'priority', order: 'asc' };
  } catch {
    return { mode: 'global', sortBy: 'priority', order: 'asc' };
  }
}

export async function saveSortConfig(config: SortConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(SORT_KEY, JSON.stringify(config));
  } catch {}
}

// ─── Reminders ────────────────────────────────────────────────────────────

/**
 * Storage identity of a reminder: habit + time + repeat mode (+ anchor date
 * for one-time reminders). Lets a user keep several reminders per habit
 * (e.g. 07:00 alarm, 21:00 nudge) while re-saves stay idempotent.
 */
function reminderKey(reminder: ReminderConfig): string {
  const mode: ReminderRepeatMode = reminder.repeat ?? 'off';
  return `${reminder.habitId}|${reminder.time}|${mode}|${mode === 'off' ? reminder.date : '*'}`;
}

/**
 * Reads stored reminders and back-fills fields added by the notification
 * engine so legacy rows (saved before repeats existed) keep working.
 */
export async function loadReminders(): Promise<ReminderConfig[]> {
  try {
    const raw = await AsyncStorage.getItem(REMINDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReminderConfig[];
    return parsed.map((r) => ({
      ...r,
      sound: r.sound ?? true,
      repeat: r.repeat ?? 'off',
      snoozeMinutes: r.snoozeMinutes ?? 15,
      enabled: r.enabled ?? true,
    }));
  } catch {
    return [];
  }
}

export async function saveReminders(reminders: ReminderConfig[]): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
  } catch {}
}

/** Inserts or replaces one reminder by its storage identity. */
export async function saveReminder(reminder: ReminderConfig): Promise<void> {
  const reminders = await loadReminders();
  const key = reminderKey(reminder);
  const idx = reminders.findIndex((r) => reminderKey(r) === key);
  if (idx >= 0) {
    reminders[idx] = reminder;
  } else {
    reminders.push(reminder);
  }
  await saveReminders(reminders);
}

export async function deleteReminder(reminder: ReminderConfig): Promise<void> {
  const reminders = await loadReminders();
  await saveReminders(reminders.filter((r) => reminderKey(r) !== reminderKey(reminder)));
}

/** First saved reminder for a habit (opened by default in the modal). */
export async function getReminderForHabit(habitId: string): Promise<ReminderConfig | undefined> {
  const reminders = await loadReminders();
  return reminders.find((r) => r.habitId === habitId);
}

/** All saved reminders for one habit, sorted by time (in-app manager list). */
export async function loadRemindersForHabit(habitId: string): Promise<ReminderConfig[]> {
  const reminders = await loadReminders();
  return reminders
    .filter((r) => r.habitId === habitId)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export async function deleteRemindersForHabit(habitId: string): Promise<void> {
  const reminders = await loadReminders();
  await saveReminders(reminders.filter((r) => r.habitId !== habitId));
}

// ─── Notification Settings ────────────────────────────────────────────────

const NOTIFICATION_SETTINGS_KEY = '@habit_planner_notifications';

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<NotificationSettings>) : {};
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...parsed,
      // A legacy/corrupt store can hold null or a non-array here; resolveChannel
      // calls exemptHabitIds.includes() while building triggers — outside any
      // try/catch — so it must always be a real string array.
      exemptHabitIds: Array.isArray(parsed.exemptHabitIds)
        ? parsed.exemptHabitIds
        : DEFAULT_NOTIFICATION_SETTINGS.exemptHabitIds,
      quietHours: {
        ...DEFAULT_NOTIFICATION_SETTINGS.quietHours,
        ...(parsed.quietHours ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS, quietHours: { ...DEFAULT_NOTIFICATION_SETTINGS.quietHours } };
  }
}

export async function saveNotificationSettings(config: NotificationSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(config));
  } catch {}
}

// ─── Categories ──────────────────────────────────────────────────────────

const CATEGORIES_KEY = '@habit_planner_categories';

export async function loadCategories(): Promise<CategoryDef[]> {
  try {
    const raw = await AsyncStorage.getItem(CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCategories(categories: CategoryDef[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  } catch {}
}

export async function addCategory(category: CategoryDef): Promise<void> {
  const cats = await loadCategories();
  cats.push(category);
  await saveCategories(cats);
}

export async function updateCategory(updated: CategoryDef): Promise<void> {
  const cats = await loadCategories();
  const idx = cats.findIndex((c) => c.id === updated.id);
  if (idx >= 0) {
    cats[idx] = updated;
    await saveCategories(cats);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const cats = await loadCategories();
  await saveCategories(cats.filter((c) => c.id !== id));
}

// ─── Sections ────────────────────────────────────────────────────────────

const DEFAULT_SECTION_ID = 'default';

export function getDefaultSectionId(): string {
  return DEFAULT_SECTION_ID;
}

export async function loadSections(): Promise<Section[]> {
  try {
    const raw = await AsyncStorage.getItem(SECTIONS_KEY);
    const sections: Section[] = raw ? JSON.parse(raw) : [];
    if (sections.length === 0) {
      sections.push({ id: DEFAULT_SECTION_ID, name: 'General', createdAt: new Date().toISOString() });
      await AsyncStorage.setItem(SECTIONS_KEY, JSON.stringify(sections));
    }
    return sections;
  } catch {
    return [{ id: DEFAULT_SECTION_ID, name: 'General', createdAt: new Date().toISOString() }];
  }
}

export async function saveSections(sections: Section[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SECTIONS_KEY, JSON.stringify(sections));
  } catch {}
}

export async function addSection(section: Section): Promise<void> {
  const sections = await loadSections();
  sections.push(section);
  await saveSections(sections);
}

export async function deleteSection(id: string): Promise<void> {
  const sections = await loadSections();
  await saveSections(sections.filter((s) => s.id !== id));
  // The habits rewrite must share the habits write lock — an unlocked
  // read-modify-write here raced the context's mutations and could revert
  // or drop a habit added in the same moment.
  await withLock(LOCK_KEYS.habits, async () => {
    const habits = await loadHabits();
    const defaultId = DEFAULT_SECTION_ID;
    await saveHabits(habits.map((h) => h.sectionId === id ? { ...h, sectionId: defaultId } : h));
  });
}
