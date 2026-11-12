// Powered by OnSpace.AI
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useHabits } from '../../hooks/useHabits';
import { useSortedHabits } from '../../hooks/useSortedHabits';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { Habit, ReminderConfig, CategoryDef } from '../../services/types';
import { PENALTY_PRESETS } from '../../services/gameRules';
import { formatDate, parseDate, getFrequencyLabel } from '../../services/recurrenceService';

import { HabitCard } from '../../components/feature/HabitCard';
import { CalendarStrip } from '../../components/feature/CalendarStrip';
import { CategoryFilter } from '../../components/feature/CategoryFilter';
import { ProgressSection } from '../../components/feature/ProgressSection';
import { EconomyStrip } from '../../components/feature/EconomyStrip';
import { SortModal } from '../../components/feature/SortModal';
import { SideDrawer } from '../../components/feature/Side Drawer';
import { CalendarPickerModal } from '../../components/feature/CalendarPickerModal';
import { ReminderModal } from '../../components/feature/ReminderModal';
import { ReminderManagerModal } from '../../components/feature/ReminderManagerModal';
import { HabitCalendarModal } from '../../components/feature/HabitCalendarModal';
import { MoodCheckModal } from '../../components/feature/MoodCheckModal';
import { GameToast } from '../../components/feature/GameToast';
import { SkeletonList } from '../../components/feature/SkeletonList';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// List virtualization tuning — smaller work-per-frame keeps the JS thread free
// for animations (toasts, HP bars) while scrolling. Habit cards are tall and
// variable-height, so a modest window + batch beats the defaults.
const LIST_WINDOW_SIZE = 7;       // render ~3 screens around the viewport (default 21)
const INIT_NUM_TO_RENDER = 6;     // first paint: only ~one screen of rows
const MAX_TO_RENDER_BATCH = 4;    // rows per incremental scroll batch
const UPDATE_CELLS_BATCHING = 40; // ms between batch renders

function formatTodayLabel(dateStr: string): string {
  const today = formatDate(new Date());
  if (dateStr === today) return 'Today';
  const d = parseDate(dateStr);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Memoized row wrapper. HabitCard itself is React.memo'd, but inline closures
 * like `onToggle={() => ...}` were brand-new on every parent render — so one
 * habit tap re-rendered EVERY card. This wrapper creates the per-row closures
 * once (stable for the row's lifetime, keyed on habit ownership), so the
 * memo boundary actually bails: a tap re-renders only the tapped card.
 */
interface HabitRowItemProps {
  habit: Habit;
  completed: boolean;
  reminderCount: number;
  quantityCount?: number;
  subDoneIds?: string[];
  isActive?: boolean;
  drag?: () => void;
  customCategories?: CategoryDef[];
  hp?: number;
  collapsed?: boolean;
  stage?: number;
  insured?: boolean;
  rebuildProgress?: number;
  onToggleId: (habitId: string) => void;
  onDeleteId: (habitId: string) => void;
  onQuantityDownId: (habitId: string) => void;
  onToggleSubId: (habitId: string, subId: string) => void;
  onReminderHabit: (habit: Habit) => void;
  onCalendarHabit: (habit: Habit) => void;
  onEditHabit: (habit: Habit) => void;
  onReviveHabit: (habit: Habit) => void;
}

const HabitRowItem = React.memo(function HabitRowItem({
  habit,
  completed,
  reminderCount,
  quantityCount,
  subDoneIds,
  isActive,
  drag,
  customCategories,
  hp,
  collapsed,
  stage,
  insured,
  rebuildProgress,
  onToggleId,
  onDeleteId,
  onQuantityDownId,
  onToggleSubId,
  onReminderHabit,
  onCalendarHabit,
  onEditHabit,
  onReviveHabit,
}: HabitRowItemProps) {
  const habitId = habit.id;
  const onToggle = useCallback(() => onToggleId(habitId), [onToggleId, habitId]);
  const onDelete = useCallback(() => onDeleteId(habitId), [onDeleteId, habitId]);
  const onQuantityDown = useCallback(() => onQuantityDownId(habitId), [onQuantityDownId, habitId]);
  const onToggleSubHabit = useCallback(
    (subId: string) => onToggleSubId(habitId, subId),
    [onToggleSubId, habitId]
  );
  const onReminder = useCallback(() => onReminderHabit(habit), [onReminderHabit, habit]);
  const onCalendar = useCallback(() => onCalendarHabit(habit), [onCalendarHabit, habit]);
  const onEdit = useCallback(() => onEditHabit(habit), [onEditHabit, habit]);
  const onRevive = useCallback(() => onReviveHabit(habit), [onReviveHabit, habit]);

  return (
    <HabitCard
      habit={habit}
      completed={completed}
      onToggle={onToggle}
      onDelete={onDelete}
      onEdit={onEdit}
      onReminder={onReminder}
      onCalendar={onCalendar}
      drag={drag}
      isActive={isActive}
      customCategories={customCategories}
      reminderCount={reminderCount}
      quantityCount={quantityCount}
      onQuantityDown={onQuantityDown}
      subDoneIds={subDoneIds}
      onToggleSubHabit={onToggleSubHabit}
      hp={hp}
      collapsed={collapsed}
      stage={stage}
      insured={insured}
      rebuildProgress={rebuildProgress}
      onRevive={onRevive}
    />
  );
});

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    habits,
    completions,
    completionMap,
    sortConfig,
    selectedDate,
    loading,
    setSelectedDate,
    toggleCompletion,
    deleteHabit,
    updateSortConfig,
    reorderHabits,
    sections,
    selectedSectionId,
    setSelectedSectionId,
    addSection,
    deleteSection,
    categories,
    pendingMood,
    setPendingMood,
    saveMood,
    stepQuantityDown,
    toggleSubHabit,
    subTodoVersion,
    hpMap,
    stageMap,
    insuranceMap,
    rebuildMissions,
    refreshHp,
    refreshEconomy,
    refreshStakes,
  } = useHabits();

  const [activeFilter, setActiveFilter] = useState('All');
  const [showSort, setShowSort] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [reminderToEdit, setReminderToEdit] = useState<ReminderConfig | undefined>(undefined);
  const [showReminder, setShowReminder] = useState(false);
  const [showHabitCalendar, setShowHabitCalendar] = useState(false);
  const [reminderDefaults, setReminderDefaults] = useState<{ type: 'alarm' | 'remind'; sound: boolean }>({ type: 'alarm', sound: true });
  const [reminderCounts, setReminderCounts] = useState<Record<string, number>>({});
  // In-app reminder control: manager list + how the editor was opened.
  const [showReminderManager, setShowReminderManager] = useState(false);
  const [cameFromManager, setCameFromManager] = useState(false);
  const [managerRefresh, setManagerRefresh] = useState(0);
  // Game layer data: today's quantity progress + sub-habit checklist state.
  const [subDoneMap, setSubDoneMap] = useState<Record<string, string[]>>({});
  // ── Economy layer ──
  const [reviving, setReviving] = useState(false);

  const isManual = sortConfig.mode === 'manual';

  const sectionHabits = useMemo(
    () => habits.filter((h) => h.sectionId === selectedSectionId),
    [habits, selectedSectionId]
  );

  /** habitId → today's unit count for quantity habits. */
  const quantityCounts = useMemo(() => {
    const map: Record<string, number> = {};
    completions.forEach((c) => {
      if (c.date === selectedDate && c.count != null) {
        map[c.habitId] = Math.max(map[c.habitId] ?? 0, c.count);
      }
    });
    return map;
  }, [completions, selectedDate]);

  const { activeHabits, completedHabits, totalForDate, completedCount, progress } =
    useSortedHabits(sectionHabits, completionMap, sortConfig, selectedDate, activeFilter, quantityCounts);

  // Sub-habit checklist state reloads on every toggle (subTodoVersion) or day change.
  const reloadSubTodo = useCallback(async () => {
    const { loadSubTodoMap } = await import('../../services/habitService');
    const map = await loadSubTodoMap();
    const dayKey = `_${selectedDate}`;
    const day: Record<string, string[]> = {};
    Object.entries(map).forEach(([key, ids]) => {
      if (key.endsWith(dayKey)) {
        const habitId = key.slice(0, key.length - dayKey.length);
        day[habitId] = ids;
      }
    });
    setSubDoneMap(day);
  }, [selectedDate]);

  useEffect(() => {
    void reloadSubTodo();
  }, [reloadSubTodo, subTodoVersion]);

  const handleToggle = useCallback((habitId: string) => {
    toggleCompletion(habitId);
  }, [toggleCompletion]);

  const handleDelete = useCallback((habitId: string) => {
    deleteHabit(habitId);
  }, [deleteHabit]);

  /**
   * Revive a collapsed habit: spends a Revival Kit 🩹 first; otherwise pays
   * the intensity preset's coin price. Never touches habit data.
   */
  const handleRevive = useCallback(async (habit: Habit) => {
    if (reviving) return;
    setReviving(true);
    try {
      const hp = await import('../../services/hpService');
      const state = await hp.getHabitHp(habit.id);
      if (state.collapsedAt) {
        let revived = false;
        // 1) Revival Kit from the shop.
        try {
          const economy = await import('../../services/economyService');
          if ((await economy.inventoryCount('revival_kit')) > 0 && (await economy.consumeInventory('revival_kit'))) {
            revived = await hp.reviveHabit(habit.id, habit.name, false);
          }
        } catch {}
        // 2) Coins (intensity preset price, discounted by the Chrono skill).
        if (!revived) {
          const [penalty, economyModule, skill] = await Promise.all([
            import('../../services/penaltyService'),
            import('../../services/economyService'),
            import('../../services/skillService'),
          ]);
          const settings = await penalty.loadPenaltySettings();
          const preset = PENALTY_PRESETS[settings.intensity];
          const priceMult = await skill.revivePriceMult();
          const price = Math.max(1, Math.round(preset.revivePrice * priceMult));
          if (price > 0 && (await economyModule.spendCoins(price, 'Revival 🕊️'))) {
            revived = await hp.reviveHabit(habit.id, habit.name, false);
          }
        }
      }
    } catch {}
    setReviving(false);
    await Promise.all([refreshHp(), refreshEconomy(), refreshStakes()]);
  }, [refreshHp, refreshEconomy, refreshStakes, reviving]);

  /** Per-card game props (HP/evolution/missions/insurance). */
  const gamePropsFor = useCallback((habitId: string) => {
    const mission = rebuildMissions[habitId];
    const hpState = hpMap[habitId];
    // Insurance expiry is a 'YYYY-MM-DD' string; lexicographic compare works.
    const insuredUntil = insuranceMap[habitId];
    return {
      hp: hpState?.hp,
      collapsed: !!hpState?.collapsedAt,
      stage: stageMap[habitId],
      insured: insuredUntil ? insuredUntil >= selectedDate : false,
      rebuildProgress: mission?.status === 'active' && mission.completedDates != null ? Math.min(3, mission.completedDates.length) : undefined,
    };
  }, [hpMap, stageMap, insuranceMap, rebuildMissions, selectedDate]);

  const reloadReminderCounts = useCallback(async () => {
    const { loadReminders } = await import('../../services/habitService');
    const reminders = await loadReminders();
    const counts: Record<string, number> = {};
    reminders.forEach((r) => {
      // Only reminders that will actually fire contribute to the badge.
      if (r.type !== 'none' && r.enabled !== false) counts[r.habitId] = (counts[r.habitId] ?? 0) + 1;
    });
    setReminderCounts(counts);
  }, []);

  const handleReminder = useCallback(async (habit: Habit) => {
    setSelectedHabit(habit);
    // Open the per-habit reminder manager (list with switches, edit, delete)
    // instead of the single-reminder editor.
    const habSrv = await import('../../services/habitService');
    const settings = await habSrv.loadNotificationSettings();
    setReminderToEdit(undefined);
    setCameFromManager(false);
    setReminderDefaults({
      type: settings.defaultType ?? 'alarm',
      sound: settings.defaultSound,
    });
    await reloadReminderCounts();
    setShowReminderManager(true);
    setManagerRefresh((k) => k + 1);
  }, [reloadReminderCounts]);

  /** Manager → editor (edit an existing reminder or start a new one). */
  const openReminderEditor = useCallback(async (reminder?: ReminderConfig) => {
    const habSrv = await import('../../services/habitService');
    const settings = await habSrv.loadNotificationSettings();
    setReminderToEdit(reminder);
    setCameFromManager(true);
    setShowReminderManager(false);
    setReminderDefaults({
      type: settings.defaultType ?? 'alarm',
      sound: settings.defaultSound,
    });
    setShowReminder(true);
  }, []);

  const handleCalendar = useCallback((habit: Habit) => {
    setSelectedHabit(habit);
    setShowHabitCalendar(true);
  }, []);

  const handleEdit = useCallback((habit: Habit) => {
    router.push({ pathname: '/add-habit', params: { editId: habit.id } });
  }, [router]);

  const handleSaveReminder = useCallback(async (reminder: ReminderConfig, originalToClear?: ReminderConfig) => {
    const { saveReminder, deleteReminder, deleteRemindersForHabit, loadNotificationSettings } = await import('../../services/habitService');
    const { scheduleReminder, cancelReminderSchedules, cancelSchedulesByHabit } = await import('../../services/notificationService');

    const habit = habits.find((h) => h.id === reminder.habitId);
    const settings = await loadNotificationSettings();

    if (reminder.type === 'none') {
      // "None" clears ONLY the reminder being edited — its original schedule
      // and stored config are cancelled by identity. Clearing every reminder
      // of the habit here used to destroy the user's other alarms too.
      if (originalToClear) {
        await cancelReminderSchedules(originalToClear);
        await deleteReminder(originalToClear);
      } else {
        // Fresh reminder picked 'none': the picker's own hint is "remove ALL
        // reminders for this habit", and the freshly built config was never
        // stored — an identity-based deleteReminder would match nothing and
        // leave zombie rows that stay "enabled" in the UI. Purge the store.
        await cancelSchedulesByHabit(reminder.habitId);
        await deleteRemindersForHabit(reminder.habitId);
      }
    } else if (habit) {
      // An edit that changed time/mode leaves the OLD identity scheduled —
      // cancel it first so re-saves never stack duplicates.
      if (originalToClear) {
        await cancelReminderSchedules(originalToClear);
        await deleteReminder(originalToClear);
      }
      // scheduleReminder cancels the previous schedules of the same identity,
      // so re-saving never stacks duplicates.
      await scheduleReminder(reminder, habit, settings);
      await saveReminder(reminder);
    }

    // refresh badge counts
    await reloadReminderCounts();
  }, [habits, reloadReminderCounts]);

  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<Habit>) => (
    <HabitRowItem
      habit={item}
      completed={!!completionMap[item.id]}
      reminderCount={reminderCounts[item.id] ?? 0}
      quantityCount={quantityCounts[item.id]}
      subDoneIds={subDoneMap[item.id]}
      isActive={isActive}
      drag={isManual ? drag : undefined}
      customCategories={categories}
      onToggleId={handleToggle}
      onDeleteId={handleDelete}
      onToggleSubId={toggleSubHabit}
      onQuantityDownId={stepQuantityDown}
      onReminderHabit={handleReminder}
      onCalendarHabit={handleCalendar}
      onEditHabit={handleEdit}
      onReviveHabit={handleRevive}
      {...gamePropsFor(item.id)}
    />
  ), [completionMap, isManual, reminderCounts, quantityCounts, subDoneMap, categories, handleToggle, handleDelete, toggleSubHabit, stepQuantityDown, handleReminder, handleCalendar, handleEdit, handleRevive, gamePropsFor]);

  const renderFlatItem = useCallback(({ item }: { item: Habit }) => (
    <HabitRowItem
      habit={item}
      completed={!!completionMap[item.id]}
      reminderCount={reminderCounts[item.id] ?? 0}
      quantityCount={quantityCounts[item.id]}
      subDoneIds={subDoneMap[item.id]}
      customCategories={categories}
      onToggleId={handleToggle}
      onDeleteId={handleDelete}
      onToggleSubId={toggleSubHabit}
      onQuantityDownId={stepQuantityDown}
      onReminderHabit={handleReminder}
      onCalendarHabit={handleCalendar}
      onEditHabit={handleEdit}
      onReviveHabit={handleRevive}
      {...gamePropsFor(item.id)}
    />
  ), [completionMap, reminderCounts, quantityCounts, subDoneMap, categories, handleToggle, handleDelete, toggleSubHabit, stepQuantityDown, handleReminder, handleCalendar, handleEdit, handleRevive, gamePropsFor]);

  const handleDragEnd = useCallback(({ data }: { data: Habit[] }) => {
    reorderHabits(data);
  }, [reorderHabits]);

  const listData = activeFilter === 'Complete' ? completedHabits : activeHabits;
  const todayLabel = formatTodayLabel(selectedDate);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 80 }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => { setShowDrawer(true); }}
          hitSlop={8}
          accessibilityLabel="Open menu"
        >
          <MaterialIcons name="menu" size={24} color={Colors.textPrimary} />
        </Pressable>

        <Pressable
          style={styles.todayPill}
          onPress={() => { setShowCalendarPicker(true); }}
        >
          <Text style={styles.todayText}>{todayLabel}</Text>
          <MaterialIcons name="keyboard-arrow-down" size={20} color="#fff" />
        </Pressable>

        <Pressable
          style={styles.iconBtn}
          onPress={() => { setShowSort(true); }}
          hitSlop={8}
          accessibilityLabel="Sort habits"
        >
          <MaterialIcons name="sort" size={24} color={Colors.textPrimary} />
        </Pressable>
      </View>

      {/* ── Calendar Strip ── */}
      <CalendarStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {/* ── Category Filter ── */}
      <CategoryFilter
        active={activeFilter}
        onSelect={setActiveFilter}
        completedCount={completedCount}
      />

      {/* ── Progress ── */}
      <ProgressSection progress={progress} completed={completedCount} total={totalForDate} />

      {/* ── Economy strip: coins + live combo (day closes itself now) ── */}
      {!loading && <EconomyStrip />}

      {/* ── Habit List ── */}
      {loading ? (
        <SkeletonList rows={5} />
      ) : listData.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="check-circle-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>
            {activeFilter === 'Complete'
              ? 'No completed habits yet'
              : `No habits for ${todayLabel}`}
          </Text>
          <Text style={styles.emptySubtitle}>
            {activeFilter === 'Complete'
              ? 'Complete a habit to see it here'
              : habits.some((h) => !h.archived)
                ? 'Try another date or clear the filters'
                : 'Tap + to add your first habit'}
          </Text>
        </View>
      ) : isManual ? (
        <DraggableFlatList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onDragEnd={handleDragEnd}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          windowSize={LIST_WINDOW_SIZE}
          initialNumToRender={INIT_NUM_TO_RENDER}
          maxToRenderPerBatch={MAX_TO_RENDER_BATCH}
          updateCellsBatchingPeriod={UPDATE_CELLS_BATCHING}
        />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={renderFlatItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          windowSize={LIST_WINDOW_SIZE}
          initialNumToRender={INIT_NUM_TO_RENDER}
          maxToRenderPerBatch={MAX_TO_RENDER_BATCH}
          updateCellsBatchingPeriod={UPDATE_CELLS_BATCHING}
          extraData={completionMap}
        />
      )}

      {/* ── Modals ── */}
      <SortModal
        visible={showSort}
        config={sortConfig}
        onClose={() => setShowSort(false)}
        onApply={updateSortConfig}
      />

      <CalendarPickerModal
        visible={showCalendarPicker}
        selectedDate={selectedDate}
        onSelectDate={(d) => { setSelectedDate(d); }}
        onClose={() => setShowCalendarPicker(false)}
        title="Select Date"
      />

      <SideDrawer
        visible={showDrawer}
        onClose={() => setShowDrawer(false)}
        onSettings={() => router.push('/settings')}
        sections={sections}
        selectedSectionId={selectedSectionId}
        onSelectSection={setSelectedSectionId}
        onAddSection={(name) => addSection({ id: `sec_${Date.now()}`, name, createdAt: new Date().toISOString() })}
        onDeleteSection={(id) => { if (id !== 'default') deleteSection(id); }}
      />

      <ReminderModal
        visible={showReminder}
        habitId={selectedHabit?.id ?? ''}
        habitName={selectedHabit?.name}
        habitFrequencyLabel={selectedHabit ? getFrequencyLabel(selectedHabit.frequency) : undefined}
        initial={reminderToEdit}
        defaults={reminderDefaults}
        onClose={() => {
          setShowReminder(false);
          setReminderToEdit(undefined);
          if (cameFromManager) {
            // Back into the manager list, refreshed with the latest storage.
            setCameFromManager(false);
            setShowReminderManager(true);
            setManagerRefresh((k) => k + 1);
          } else {
            setSelectedHabit(null);
          }
        }}
        onSave={handleSaveReminder}
      />

      <ReminderManagerModal
        visible={showReminderManager}
        habit={selectedHabit}
        refreshKey={managerRefresh}
        onClose={() => { setShowReminderManager(false); setSelectedHabit(null); }}
        onEditReminder={(reminder) => { void openReminderEditor(reminder); }}
        onAddReminder={() => { void openReminderEditor(undefined); }}
        onChanged={() => { void reloadReminderCounts(); }}
      />

      {selectedHabit && (
        <HabitCalendarModal
          visible={showHabitCalendar}
          habit={selectedHabit}
          completions={completions}
          onClose={() => { setShowHabitCalendar(false); setSelectedHabit(null); }}
        />
      )}

      {/* ── Game layer: mood sheet + toasts ── */}
      <MoodCheckModal
        prompt={pendingMood}
        onSave={(habitId, date, mood) => { void saveMood(habitId, date, mood); }}
        onSkip={() => setPendingMood(null)}
      />
      <GameToast />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: 2,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  todayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 9,
    gap: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  todayText: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 110,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
});
