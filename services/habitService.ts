// Powered by OnSpace.AI
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Habit, HabitCompletion, SortConfig, ReminderConfig, Section, CategoryDef, SoundConfig, DEFAULT_SOUND_CONFIG } from './types';

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

export async function toggleCompletion(habitId: string, date: string): Promise<boolean> {
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

export async function loadReminders(): Promise<ReminderConfig[]> {
  try {
    const raw = await AsyncStorage.getItem(REMINDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveReminders(reminders: ReminderConfig[]): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
  } catch {}
}

export async function saveReminder(reminder: ReminderConfig): Promise<void> {
  const reminders = await loadReminders();
  const idx = reminders.findIndex(
    (r) => r.habitId === reminder.habitId && r.date === reminder.date
  );
  if (idx >= 0) {
    reminders[idx] = reminder;
  } else {
    reminders.push(reminder);
  }
  await saveReminders(reminders);
}

export async function deleteReminder(habitId: string, date: string): Promise<void> {
  const reminders = await loadReminders();
  await saveReminders(reminders.filter((r) => !(r.habitId === habitId && r.date === date)));
}

// ─── Sound Config ────────────────────────────────────────────────────────

const SOUND_KEY = '@habit_planner_sound';

export async function loadSoundConfig(): Promise<SoundConfig> {
  try {
    const raw = await AsyncStorage.getItem(SOUND_KEY);
    return raw ? { ...DEFAULT_SOUND_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_SOUND_CONFIG };
  } catch {
    return { ...DEFAULT_SOUND_CONFIG };
  }
}

export async function saveSoundConfig(config: SoundConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(SOUND_KEY, JSON.stringify(config));
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
  const habits = await loadHabits();
  const defaultId = DEFAULT_SECTION_ID;
  await saveHabits(habits.map((h) => h.sectionId === id ? { ...h, sectionId: defaultId } : h));
}
