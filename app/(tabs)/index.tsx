// Powered by OnSpace.AI
import React, { useState, useCallback, useMemo } from 'react';
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
import { Habit } from '../../services/types';
import { vibrateOnTap } from '../../services/soundService';
import { formatDate, parseDate } from '../../services/recurrenceService';

import { HabitCard } from '../../components/feature/HabitCard';
import { CalendarStrip } from '../../components/feature/CalendarStrip';
import { CategoryFilter } from '../../components/feature/CategoryFilter';
import { ProgressSection } from '../../components/feature/ProgressSection';
import { SortModal } from '../../components/feature/SortModal';
import { SideDrawer } from '../../components/feature/Side Drawer';
import { CalendarPickerModal } from '../../components/feature/CalendarPickerModal';
import { ReminderModal } from '../../components/feature/ReminderModal';
import { HabitCalendarModal } from '../../components/feature/HabitCalendarModal';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTodayLabel(dateStr: string): string {
  const today = formatDate(new Date());
  if (dateStr === today) return 'Today';
  const d = parseDate(dateStr);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

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
  } = useHabits();

  const [activeFilter, setActiveFilter] = useState('All');
  const [showSort, setShowSort] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [showHabitCalendar, setShowHabitCalendar] = useState(false);

  const isManual = sortConfig.mode === 'manual';

  const sectionHabits = useMemo(
    () => habits.filter((h) => h.sectionId === selectedSectionId),
    [habits, selectedSectionId]
  );

  const { activeHabits, completedHabits, totalForDate, completedCount, progress } =
    useSortedHabits(sectionHabits, completionMap, sortConfig, selectedDate, activeFilter);

  const handleToggle = useCallback((habitId: string) => {
    toggleCompletion(habitId);
  }, [toggleCompletion]);

  const handleDelete = useCallback((habitId: string) => {
    deleteHabit(habitId);
  }, [deleteHabit]);

  const handleReminder = useCallback((habit: Habit) => {
    setSelectedHabit(habit);
    setShowReminder(true);
  }, []);

  const handleCalendar = useCallback((habit: Habit) => {
    setSelectedHabit(habit);
    setShowHabitCalendar(true);
  }, []);

  const handleEdit = useCallback((habit: Habit) => {
    router.push({ pathname: '/add-habit', params: { editId: habit.id } });
  }, [router]);

  const handleSaveReminder = useCallback(async (reminder: any) => {
    const { saveReminder } = await import('../../services/habitService');
    const { scheduleAlarm } = await import('../../services/notificationService');
    const habit = habits.find((h) => h.id === reminder.habitId);
    if (habit && reminder.type !== 'none') {
      await scheduleAlarm(reminder, habit.name);
    }
    await saveReminder(reminder);
  }, [habits]);

  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<Habit>) => (
    <HabitCard
      habit={item}
      completed={!!completionMap[item.id]}
      onToggle={() => handleToggle(item.id)}
      onDelete={() => handleDelete(item.id)}
      onReminder={() => handleReminder(item)}
      onCalendar={() => handleCalendar(item)}
      onEdit={() => handleEdit(item)}
      drag={isManual ? drag : undefined}
      isActive={isActive}
      customCategories={categories}
    />
  ), [completionMap, handleToggle, handleDelete, isManual, handleReminder, handleCalendar, handleEdit, categories]);

  const renderFlatItem = useCallback(({ item }: { item: Habit }) => (
    <HabitCard
      habit={item}
      completed={!!completionMap[item.id]}
      onToggle={() => handleToggle(item.id)}
      onDelete={() => handleDelete(item.id)}
      onReminder={() => handleReminder(item)}
      onCalendar={() => handleCalendar(item)}
      onEdit={() => handleEdit(item)}
      customCategories={categories}
    />
  ), [completionMap, handleToggle, handleDelete, handleReminder, handleCalendar, handleEdit, categories]);

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
          onPress={() => { vibrateOnTap(); setShowDrawer(true); }}
          hitSlop={8}
          accessibilityLabel="Open menu"
        >
          <MaterialIcons name="menu" size={24} color={Colors.textPrimary} />
        </Pressable>

        <Pressable
          style={styles.todayPill}
          onPress={() => { vibrateOnTap(); setShowCalendarPicker(true); }}
        >
          <Text style={styles.todayText}>{todayLabel}</Text>
          <MaterialIcons name="keyboard-arrow-down" size={20} color="#fff" />
        </Pressable>

        <Pressable
          style={styles.iconBtn}
          onPress={() => { vibrateOnTap(); setShowSort(true); }}
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

      {/* ── Habit List ── */}
      {loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading habits…</Text>
        </View>
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
        />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={renderFlatItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
        onClose={() => { setShowReminder(false); setSelectedHabit(null); }}
        onSave={handleSaveReminder}
      />

      {selectedHabit && (
        <HabitCalendarModal
          visible={showHabitCalendar}
          habit={selectedHabit}
          completions={completions}
          onClose={() => { setShowHabitCalendar(false); setSelectedHabit(null); }}
        />
      )}
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
    borderWidth: 0.5,
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
