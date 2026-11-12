import React, { createContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { Habit, HabitCompletion, SortConfig, Section, CategoryDef, CompletionMood, LevelInfo } from '../services/types';
import {
  loadHabits,
  saveHabits,
  loadCompletions,
  loadSortConfig,
  saveSortConfig,
  toggleCompletion as toggleCompletionService,
  stepQuantity as stepQuantityService,
  setMoodForCompletion,
  toggleSubHabit as toggleSubHabitService,
  purgeHabitData,
  loadSections,
  saveSections,
  deleteSection as deleteSectionService,
  getDefaultSectionId,
  loadCategories,
  addCategory as addCategoryService,
  updateCategory as updateCategoryService,
  deleteCategory as deleteCategoryService,
} from '../services/habitService';
import { todayStr } from '../services/recurrenceService';
import { withLock, LOCK_KEYS } from '../services/writeLock';
import { playCompletionSound, playDeleteSound, playLevelUpSound, playCoinSound, playPenaltySound, playChestSound, playEvolveSound, playReviveSound } from '../services/soundService';
import { onCompletionsChanged } from '../services/habitEvents';
import * as xpService from '../services/xpService';
import type { GameEvent } from '../services/xpService';
import { levelInfoFromTotal } from '../services/xpService';
import { computeComboMultiplier } from '../services/economyService';
import { stageMapFor } from '../services/evolutionService';
import type { HabitHpState } from '../services/hpService';
import type { RebuildMission } from '../services/penaltyService';

export interface MoodPrompt {
  habitId: string;
  date: string;
}

export interface HabitContextType {
  habits: Habit[];
  completions: HabitCompletion[];
  completionMap: Record<string, boolean>;
  sortConfig: SortConfig;
  selectedDate: string;
  sections: Section[];
  selectedSectionId: string;
  categories: CategoryDef[];
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
  // ── Game layer (Phase 3) ──
  xpTotal: number;
  levelInfo: LevelInfo;
  gameToast: GameEvent | null;
  gameToastKey: number;
  clearGameToast: () => void;
  pendingMood: MoodPrompt | null;
  setPendingMood: (prompt: MoodPrompt | null) => void;
  saveMood: (habitId: string, date: string, mood: CompletionMood) => Promise<void>;
  stepQuantityUp: (habitId: string) => Promise<void>;
  stepQuantityDown: (habitId: string) => Promise<void>;
  toggleSubHabit: (habitId: string, subId: string) => Promise<void>;
  subTodoVersion: number;
  refreshXp: () => Promise<void>;
  // ── Economy layer (Phase 4A–4D) ──
  /** Coin wallet balance. */
  coins: number;
  /** Current combo chain length + multiplier it maps to. */
  comboCount: number;
  comboMult: number;
  /** habitId → HP state (damage bar + collapse flag). */
  hpMap: Record<string, HabitHpState>;
  /** habitId → evolution stage index (🌱🌿🌳✨). */
  stageMap: Record<string, number>;
  /** habitId → insurance expiry 'YYYY-MM-DD' (from the economy store). */
  insuranceMap: Record<string, string>;
  /** Active rebuild missions keyed by habitId. */
  rebuildMissions: Record<string, RebuildMission>;
  refreshEconomy: () => Promise<void>;
  refreshHp: () => Promise<void>;
  /** Legacy name kept for call sites — reloads rebuild missions map. */
  refreshStakes: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  // ── Game state (XP / toasts / mood prompts / checklists) ──
  const [xpTotal, setXpTotal] = useState(0);
  const [gameToast, setGameToast] = useState<GameEvent | null>(null);
  const [gameToastKey, setGameToastKey] = useState(0);
  const [pendingMood, setPendingMood] = useState<MoodPrompt | null>(null);
  const [subTodoVersion, setSubTodoVersion] = useState(0);

  // ── Economy state (coins / combo / HP / evolution / missions) ──
  const [coins, setCoins] = useState(0);
  const [comboCount, setComboCount] = useState(0);
  const [hpMap, setHpMap] = useState<Record<string, HabitHpState>>({});
  const [insuranceMap, setInsuranceMap] = useState<Record<string, string>>({});
  const [rebuildMissions, setRebuildMissions] = useState<Record<string, RebuildMission>>({});

  const comboMult = useMemo(() => computeComboMultiplier(comboCount), [comboCount]);

  const refreshEconomy = useCallback(async () => {
    try {
      const [economy, skill] = await Promise.all([
        import('../services/economyService'),
        import('../services/skillService'),
      ]);
      const store = await economy.loadEconomy();
      setCoins(store.coins);
      setInsuranceMap(store.insurance ?? {});
      // A combo chain only displays while it's still inside its window —
      // an expired chain would mislead (next completion resets it).
      let live = 0;
      if (store.combo.lastAtMs && store.combo.count > 0) {
        const windowMin = await skill.comboWindowMinutes();
        const now = Date.now();
        const last = new Date(store.combo.lastAtMs);
        const sameDay =
          `${last.getFullYear()}-${last.getMonth()}-${last.getDate()}` ===
          `${new Date(now).getFullYear()}-${new Date(now).getMonth()}-${new Date(now).getDate()}`;
        if (sameDay && now - store.combo.lastAtMs <= windowMin * 60000) live = store.combo.count;
      }
      setComboCount(live);
    } catch {}
  }, []);

  const refreshHp = useCallback(async () => {
    try {
      const hp = await import('../services/hpService');
      setHpMap(await hp.getHpMap());
    } catch {}
  }, []);

  /** Reloads the rebuild-missions map (legacy `stakes` name kept for callers). */
  const refreshStakes = useCallback(async () => {
    try {
      const penalty = await import('../services/penaltyService');
      const missions = await penalty.getRebuildMissions();
      const map: Record<string, RebuildMission> = {};
      missions.forEach((m) => { map[m.habitId] = m; });
      setRebuildMissions(map);
    } catch {}
  }, []);

  const levelInfo = useMemo(() => levelInfoFromTotal(xpTotal), [xpTotal]);

  /** habitId → evolution stage index, derived purely from completions. */
  const stageMap = useMemo(
    () => stageMapFor(habits.map((h) => h.id), completions),
    [habits, completions]
  );

  const refreshXp = useCallback(async () => {
    setXpTotal(await xpService.loadTotalXp());
  }, []);

  useEffect(() => {
    void refreshXp();
    // XP events also mean frozen days may have changed → refresh the cache.
    try {
      void (async () => {
        const ns = await import('../services/notificationService');
        await ns.refreshFreezeCache();
      })();
    } catch {}
  }, [refreshXp]);

  useEffect(() => {
    const unsubscribe = xpService.subscribeGameEvents((event) => {
      // Level-ups get the full-screen LevelUpOverlay instead of the strip toast.
      if (event.type !== 'levelup') {
        setGameToast(event);
        setGameToastKey((k) => k + 1);
      }
      // Every game event carries its own sound profile.
      switch (event.type) {
        case 'levelup':
        case 'prestige':
          void playLevelUpSound();
          break;
        case 'coin':
          void playCoinSound();
          break;
        case 'penalty':
        case 'collapse':
          void playPenaltySound();
          break;
        case 'season':
          void playChestSound();
          break;
        case 'evolve':
          void playEvolveSound();
          break;
        case 'revive':
          void playReviveSound();
          break;
        default:
          break; // combo / rebuild / skill stay silent (their own toasts suffice)
      }
      // Money- and HP-flavour events change the economy state.
      if (
        event.type === 'coin' || event.type === 'penalty' ||
        event.type === 'collapse' || event.type === 'revive' ||
        event.type === 'season' ||
        event.type === 'rebuild' ||
        event.type === 'levelup' // levels pay SP → coins unaffected but XP bar is
      ) {
        void refreshEconomy();
        void refreshXp();
      }
      if (
        event.type === 'penalty' || event.type === 'collapse' ||
        event.type === 'revive' || event.type === 'rebuild'
      ) {
        void refreshHp();
        void refreshStakes();
      }
    });
    return unsubscribe;
  }, [refreshEconomy, refreshHp, refreshStakes, refreshXp]);

  // ── Boot sweep: prime the difficulty cache, punish forgotten past days +
  // settle finished seasons, then load the whole economy layer once. ──
  const economyBootedRef = useRef(false);

  useEffect(() => {
    if (economyBootedRef.current) return;
    economyBootedRef.current = true;
    void (async () => {
      try {
        const [difficulty, penalty, season] = await Promise.all([
          import('../services/difficultyService'),
          import('../services/penaltyService'),
          import('../services/seasonService'),
        ]);
        await difficulty.initDifficulty();
        // Feature retirement: stakes went against the app's "earn, don't
        // gamble" spirit — refund any unsettled legacy stakes on boot so no
        // coin was orphaned by the removal. Runs before the day sweep.
        try {
          const stakes = await import('../services/stakesService');
          await stakes.refundAllActiveStakes();
        } catch {}
        await penalty.sweepMissedDays();
        await season.processSeasonRollover();
        // Legend skills need the difficulty cache primed first — a boot sweep
        // grants anything already earned (idempotent).
        try {
          const skill = await import('../services/skillService');
          await skill.checkLegendSkills();
        } catch {}
      } catch {}
      void refreshEconomy();
      void refreshHp();
      void refreshXp();
    })();
  }, [refreshEconomy, refreshHp, refreshXp]);

  // Rebuild missions reload on day change / boot.
  useEffect(() => {
    void refreshStakes();
  }, [refreshStakes]);

  const refreshCompletionsSeq = useRef(0);
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);
  const refreshCompletions = useCallback(async () => {
    // Guard the date-switch race: rapid taps can resolve out of order and a
    // stale load would otherwise paint the PREVIOUS day's completions.
    const seq = ++refreshCompletionsSeq.current;
    // Re-read the CURRENT date at execution time — a completion toggled the
    // day before the user switches can still be in flight, and a stale
    // callback would commit the previous day's map onto the new day.
    const date = selectedDateRef.current;
    const completions = await loadCompletions();
    // Same map as the old getCompletionMap(date) call, but computed from the
    // array we already loaded — previously the FULL history was JSON-parsed
    // twice on every toggle / date switch.
    const map: Record<string, boolean> = {};
    completions.forEach((c) => {
      if (c.date === date && c.completed) map[c.habitId] = true;
    });
    if (seq !== refreshCompletionsSeq.current) return; // a newer switch superseded this load
    if (date !== selectedDateRef.current) return; // the day moved while loading — drop stale map
    setCompletions(completions);
    setCompletionMap(map);
  }, []);

  const refreshCategories = useCallback(async () => {
    const cats = await loadCategories();
    setCategories(cats);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [h, sc, secs, cats] = await Promise.all([
        loadHabits(),
        loadSortConfig(),
        loadSections(),
        loadCategories(),
      ]);
      const migrated = h.map((hh) => ({
        ...hh,
        sectionId: (hh as any).sectionId || getDefaultSectionId(),
      }));
      setHabits(migrated);
      setSortConfig(sc);
      setSections(secs);
      setCategories(cats);
      await refreshCompletions();
      setLoading(false);
    })();
  }, [refreshCompletions]);

  useEffect(() => {
    void refreshCompletions();
  }, [selectedDate, refreshCompletions]);

  // ── Automatic day rollover ──
  // Days are never closed by hand: the moment the clock moves into a new
  // day (interval tick or app returning to the foreground) the previous
  // day(s) are swept shut and the whole game layer re-syncs. If the user
  // was sitting on "Today", the view follows into the new day.
  const todayRef = useRef(todayStr());
  useEffect(() => {
    const roll = async () => {
      const nowToday = todayStr();
      if (nowToday === todayRef.current) return;
      const prev = todayRef.current;
      todayRef.current = nowToday;
      try {
        const penalty = await import('../services/penaltyService');
        await penalty.sweepMissedDays(); // closes the previous day(s) automatically
      } catch {}
      await refreshCompletions();
      await Promise.all([refreshEconomy(), refreshHp(), refreshStakes(), refreshXp()]);
      // Follow the user's "Today" forward; a picked past date stays put.
      setSelectedDate((d) => (d === prev ? nowToday : d));
    };
    const t = setInterval(() => { void roll(); }, 30_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void roll();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [refreshCompletions, refreshEconomy, refreshHp, refreshStakes, refreshXp]);

  // Completions can change outside the React tree too — e.g. tapping "Done"
  // on a system notification. Re-sync the in-app state when that happens.
  useEffect(() => {
    const unsubscribe = onCompletionsChanged(() => {
      refreshCompletions();
    });
    return unsubscribe;
  }, [refreshCompletions]);

  // Every mutation below re-reads the LATEST on-disk habits array inside the
  // habits write lock instead of building the next array from the captured
  // `habits` React state. The callbacks used to read-modify-write the whole
  // array from stale state: two quick mutations (add + archive, drag-reorder
  // + edit, a mutation racing deleteSection) overwrote each other and
  // silently dropped a habit or reverted a change. Same discipline the
  // completions store already follows via writeLock.
  const addHabit = useCallback(async (habit: Habit) => {
    const updated = await withLock(LOCK_KEYS.habits, async () => {
      const fresh = await loadHabits();
      const next = [...fresh, { ...habit, sectionId: selectedSectionId }];
      await saveHabits(next);
      return next;
    });
    setHabits(updated);
    // Today's plan changed → refresh smart-alert bodies + badge.
    try {
      const ns = await import('../services/notificationService');
      void ns.refreshDynamicAlerts();
    } catch {}
  }, [selectedSectionId]);

  const updateHabit = useCallback(async (habit: Habit) => {
    const updated = await withLock(LOCK_KEYS.habits, async () => {
      const fresh = await loadHabits();
      const next = fresh.map((h) => (h.id === habit.id ? habit : h));
      await saveHabits(next);
      return next;
    });
    setHabits(updated);
    // Frequency/times/classification may affect every schedule → full resync.
    try {
      const ns = await import('../services/notificationService');
      void ns.rebuildAllSchedules();
    } catch {}
  }, []);

  const deleteHabit = useCallback(async (id: string) => {
    const updated = await withLock(LOCK_KEYS.habits, async () => {
      const fresh = await loadHabits();
      const next = fresh.filter((h) => h.id !== id);
      await saveHabits(next);
      return next;
    });
    setHabits(updated);
    // Also drop the deleted habit's completion history, reminders and any
    // still-scheduled alarm so storage and this session stay orphan-free.
    await purgeHabitData(id);
    playDeleteSound();
    try {
      const ns = await import('../services/notificationService');
      void ns.refreshDynamicAlerts();
    } catch {}
  }, []);

  const archiveHabit = useCallback(async (id: string, archived: boolean) => {
    const updated = await withLock(LOCK_KEYS.habits, async () => {
      const fresh = await loadHabits();
      const next = fresh.map((h) => (h.id === id ? { ...h, archived } : h));
      await saveHabits(next);
      return next;
    });
    setHabits(updated);
    // Archived habits drop out of all schedules immediately.
    try {
      const ns = await import('../services/notificationService');
      void ns.rebuildAllSchedules();
    } catch {}
  }, []);

  const toggleCompletion = useCallback(async (habitId: string) => {
    const habit = habits.find((h) => h.id === habitId);
    let completedNow = false;

    if (habit?.targetCount && habit.targetCount > 0) {
      // Quantity habit: tapping +1s a unit; reaching the target completes it.
      const step = await stepQuantityService(habitId, selectedDate, +1, habit.targetCount);
      completedNow = step.completed;
      await xpService.onQuantityStep(habitId, selectedDate, step);
      if (step.justCompleted) {
        playCompletionSound();
        // Same post-completion mood sheet the plain branch offers — quantity
        // completions were silently excluded from the whole mood-bonus economy
        // (Empathy nodes, rough-day grace) because this was never called.
        setPendingMood({ habitId, date: selectedDate });
      }
    } else {
      completedNow = await toggleCompletionService(habitId, selectedDate);
      if (completedNow) {
        playCompletionSound();
        // Offer the post-completion mood sheet (grants a mood bonus).
        setPendingMood({ habitId, date: selectedDate });
        await xpService.onHabitToggled(habitId, selectedDate, true);
      } else {
        await xpService.onHabitToggled(habitId, selectedDate, false);
      }
    }

    await refreshCompletions();
    void refreshXp();
    // Notification pipeline: refresh dynamic alerts + milestone & perfect-day
    // celebrations + iOS badge count.
    try {
      const ns = await import('../services/notificationService');
      void ns.handleHabitCompleted(habitId, completedNow);
    } catch {}
  }, [habits, selectedDate, refreshCompletions, refreshXp]);

  const stepQuantityUp = useCallback(async (habitId: string) => {
    await toggleCompletion(habitId);
  }, [toggleCompletion]);

  const stepQuantityDown = useCallback(async (habitId: string) => {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit?.targetCount || habit.targetCount <= 0) return;
    const step = await stepQuantityService(habitId, selectedDate, -1, habit.targetCount);
    await xpService.onQuantityStep(habitId, selectedDate, step);
    if (step.justUncompleted) {
      playDeleteSound();
    } else {
      // Data removal stays silent (no sound).
      void step;
    }
    await refreshCompletions();
    void refreshXp();
    const stillDone = step.completed;
    try {
      const ns = await import('../services/notificationService');
      void ns.handleHabitCompleted(habitId, stillDone);
    } catch {}
  }, [habits, selectedDate, refreshCompletions, refreshXp]);

  const toggleSubHabit = useCallback(async (habitId: string, subId: string) => {
    const habit = habits.find((h) => h.id === habitId);
    const doneList = await toggleSubHabitService(habitId, selectedDate, subId);
    setSubTodoVersion((v) => v + 1);
    const total = habit?.subHabits?.length ?? 0;
    if (total > 0 && doneList.length >= total) {
      const prevFull = false; // claimReward inside XP service is once-per-day anyway
      void prevFull;
      await xpService.onSubHabitListChanged(habitId, selectedDate, true);
    } else {
      await xpService.onSubHabitListChanged(habitId, selectedDate, false);
    }
    void refreshXp();
  }, [habits, selectedDate, refreshXp]);

  const saveMood = useCallback(async (habitId: string, date: string, mood: CompletionMood) => {
    await setMoodForCompletion(habitId, date, mood);
    await xpService.onMoodSelected(habitId, date, mood);
    setPendingMood(null);
    void refreshXp();
  }, [refreshXp]);

  const updateSortConfig = useCallback(async (config: SortConfig) => {
    setSortConfig(config);
    await saveSortConfig(config);
  }, []);

  const reorderHabits = useCallback(async (reordered: Habit[]) => {
    // `reordered` is whatever the list currently shows — a filtered subset
    // when a category/deadline filter is active. Renumbering just that
    // payload scrambled the "All" view. Instead, transplant the subset's NEW
    // relative order onto the slot positions it occupies in the full list;
    // habits outside the subset keep their positions untouched. The full
    // list is re-read on disk under the lock so a concurrent edit doesn't
    // get overwritten by this save.
    const updated = await withLock(LOCK_KEYS.habits, async () => {
      const fresh = await loadHabits();
      const ids = new Set(reordered.map((h) => h.id));
      const full = [...fresh].sort((a, b) => a.order - b.order);
      const slots: number[] = [];
      full.forEach((h, i) => { if (ids.has(h.id)) slots.push(i); });

      // When the drag span equals the whole list this reduces to a plain
      // full reorder — one path handles both.
      const next = [...full];
      reordered.forEach((h, i) => {
        const slot = slots[i];
        if (slot != null) next[slot] = h;
      });
      const renumbered = next.map((h, i) => ({ ...h, order: i }));
      await saveHabits(renumbered);
      return renumbered;
    });
    setHabits(updated);
  }, []);

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

  const clearGameToast = useCallback(() => setGameToast(null), []);

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

  // The value object must be memoized: an inline object is brand-new on every
  // provider render, which re-renders EVERY consumer screen on any state
  // change (a toast bump, a combo tick, etc.). Memoization keeps consumers
  // subscribed only to the slices they actually read.
  const contextValue = useMemo(() => ({
    habits,
    completions,
    completionMap,
    sortConfig,
    selectedDate,
    sections,
    selectedSectionId,
    categories,
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
    xpTotal,
    levelInfo,
    gameToast,
    gameToastKey,
    clearGameToast,
    pendingMood,
    setPendingMood,
    saveMood,
    stepQuantityUp,
    stepQuantityDown,
    toggleSubHabit,
    subTodoVersion,
    refreshXp,
    coins,
    comboCount,
    comboMult,
    hpMap,
    stageMap,
    insuranceMap,
    rebuildMissions,
    refreshEconomy,
    refreshHp,
    refreshStakes,
  }), [
    habits, completions, completionMap, sortConfig, selectedDate, sections,
    selectedSectionId, categories, loading,
    addHabit, updateHabit, deleteHabit, archiveHabit, toggleCompletion,
    updateSortConfig, refreshCompletions, reorderHabits,
    addSectionAction, deleteSectionAction, addCategoryAction, updateCategoryAction,
    deleteCategoryAction, refreshCategories,
    xpTotal, levelInfo, gameToast, gameToastKey, clearGameToast, pendingMood,
    saveMood, stepQuantityUp, stepQuantityDown, toggleSubHabit, subTodoVersion, refreshXp,
    coins, comboCount, comboMult, hpMap, stageMap, insuranceMap, rebuildMissions,
    refreshEconomy, refreshHp, refreshStakes,
  ]);

  return (
    <HabitContext.Provider value={contextValue}>
      {children}
    </HabitContext.Provider>
  );
}
