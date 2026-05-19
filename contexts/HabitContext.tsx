import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Habit, HabitCompletion, SortConfig, Section, CategoryDef, SoundConfig, DEFAULT_SOUND_CONFIG } from '../services/types';
import {
  loadHabits,
  saveHabits,
  loadCompletions,
  loadSortConfig,
  saveSortConfig,
  toggleCompletion as toggleCompletionService,
  getCompletionMap,
  loadSections,
  saveSections,
  addSection as addSectionService,
  deleteSection as deleteSectionService,
  getDefaultSectionId,
  loadCategories,
  saveCategories,
  addCategory as addCategoryService,
  updateCategory as updateCategoryService,
  deleteCategory as deleteCategoryService,
  loadSoundConfig,
  saveSoundConfig,
} from '../services/habitService';
import { todayStr } from '../services/recurrenceService';
import { setSoundConfig, playCompletionSound, playDeleteSound } from '../services/soundService';

export interface HabitContextType {
  habits: Habit[];
  completions: HabitCompletion[];
  completionMap: Record<string, boolean>;
  sortConfig: SortConfig;
  selectedDate: string;
  sections: Section[];
  selectedSectionId: string;
  categories: CategoryDef[];
  soundConfig: SoundConfig;
  loading: boolean;
  setSelectedDate: (date: string) => void;
  setSelectedSectionId: (id: string) => void;
  addHabit: (habit: Habit) => Promise<void>;
  updateHabit: (habit: Habit) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  archiveHabit: (id: string, archived: boolean) => Promise<void>;
  toggleCompletion: (habitId: string) => Promise<void>;
  updateSortConfig: (config: SortConfig) => Promise<void>;
  refreshCompletions: () => Promise<void>;
  reorderHabits: (habits: Habit[]) => Promise<void>;
  addSection: (section: Section) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  addCategory: (cat: CategoryDef) => Promise<void>;
  updateCategory: (cat: CategoryDef) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  refreshCategories: () => Promise<void>;
  loadAndSetSoundConfig: () => Promise<void>;
  updateSoundConfig: (config: SoundConfig) => Promise<void>;
}

export const HabitContext = createContext<HabitContextType | undefined>(undefined);

export function HabitProvider({ children }: { children: ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [completionMap, setCompletionMap] = useState<Record<string, boolean>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>({ mode: 'global', sortBy: 'priority', order: 'asc' });
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(getDefaultSectionId());
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [soundConfig, setSoundConfigState] = useState<SoundConfig>(DEFAULT_SOUND_CONFIG);
  const [loading, setLoading] = useState(true);

  const refreshCompletions = useCallback(async () => {
    const [allCompletions, map] = await Promise.all([
      loadCompletions(),
      getCompletionMap(selectedDate),
    ]);
    setCompletions(allCompletions);
    setCompletionMap(map);
  }, [selectedDate]);

  const refreshCategories = useCallback(async () => {
    const cats = await loadCategories();
    setCategories(cats);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [h, sc, secs, cats, snd] = await Promise.all([
        loadHabits(),
        loadSortConfig(),
        loadSections(),
        loadCategories(),
        loadSoundConfig(),
      ]);
      const migrated = h.map((hh) => ({
        ...hh,
        sectionId: (hh as any).sectionId || getDefaultSectionId(),
      }));
      setHabits(migrated);
      setSortConfig(sc);
      setSections(secs);
      setCategories(cats);
      setSoundConfigState(snd);
      setSoundConfig(snd);
      await refreshCompletions();
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    refreshCompletions();
  }, [selectedDate]);

  const addHabit = useCallback(async (habit: Habit) => {
    const updated = [...habits, { ...habit, sectionId: selectedSectionId }];
    setHabits(updated);
    await saveHabits(updated);
  }, [habits, selectedSectionId]);

  const updateHabit = useCallback(async (habit: Habit) => {
    const updated = habits.map((h) => (h.id === habit.id ? habit : h));
    setHabits(updated);
    await saveHabits(updated);
  }, [habits]);

  const deleteHabit = useCallback(async (id: string) => {
    const updated = habits.filter((h) => h.id !== id);
    setHabits(updated);
    await saveHabits(updated);
    playDeleteSound();
  }, [habits]);

  const archiveHabit = useCallback(async (id: string, archived: boolean) => {
    const updated = habits.map((h) => h.id === id ? { ...h, archived } : h);
    setHabits(updated);
    await saveHabits(updated);
  }, [habits]);

  const toggleCompletion = useCallback(async (habitId: string) => {
    const newState = await toggleCompletionService(habitId, selectedDate);
    if (newState) playCompletionSound();
    await refreshCompletions();
  }, [selectedDate, refreshCompletions]);

  const updateSortConfig = useCallback(async (config: SortConfig) => {
    setSortConfig(config);
    await saveSortConfig(config);
  }, []);

  const reorderHabits = useCallback(async (reordered: Habit[]) => {
    const orderMap = new Map<string, number>();
    reordered.forEach((h, i) => orderMap.set(h.id, i));
    const updated = habits.map((h) => {
      const newOrder = orderMap.get(h.id);
      return newOrder !== undefined ? { ...h, order: newOrder } : h;
    });
    setHabits(updated);
    await saveHabits(updated);
  }, [habits]);

  const addSectionAction = useCallback(async (section: Section) => {
    const updated = [...sections, section];
    setSections(updated);
    await saveSections(updated);
  }, [sections]);

  const deleteSectionAction = useCallback(async (id: string) => {
    await deleteSectionService(id);
    const updated = await loadSections();
    setSections(updated);
    if (selectedSectionId === id) {
      setSelectedSectionId(getDefaultSectionId());
    }
    const h = await loadHabits();
    setHabits(h);
  }, [selectedSectionId]);

  const loadAndSetSoundConfigAction = useCallback(async () => {
    const snd = await loadSoundConfig();
    setSoundConfigState(snd);
    setSoundConfig(snd);
  }, []);

  const updateSoundConfigAction = useCallback(async (config: SoundConfig) => {
    setSoundConfigState(config);
    setSoundConfig(config);
    await saveSoundConfig(config);
  }, []);

  const addCategoryAction = useCallback(async (cat: CategoryDef) => {
    await addCategoryService(cat);
    setCategories((prev) => [...prev, cat]);
  }, []);

  const updateCategoryAction = useCallback(async (cat: CategoryDef) => {
    await updateCategoryService(cat);
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? cat : c)));
  }, []);

  const deleteCategoryAction = useCallback(async (id: string) => {
    await deleteCategoryService(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <HabitContext.Provider
      value={{
        habits,
        completions,
        completionMap,
        sortConfig,
        selectedDate,
        sections,
        selectedSectionId,
        categories,
        soundConfig,
        loading,
        setSelectedDate,
        setSelectedSectionId,
        addHabit,
        updateHabit,
        deleteHabit,
        archiveHabit,
        toggleCompletion,
        updateSortConfig,
        refreshCompletions,
        reorderHabits,
        addSection: addSectionAction,
        deleteSection: deleteSectionAction,
        addCategory: addCategoryAction,
        updateCategory: updateCategoryAction,
        deleteCategory: deleteCategoryAction,
        refreshCategories,
        loadAndSetSoundConfig: loadAndSetSoundConfigAction,
        updateSoundConfig: updateSoundConfigAction,
      }}
    >
      {children}
    </HabitContext.Provider>
  );
}
