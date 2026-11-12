// All-Habits Manager — full-screen route reached from the Game Hub drawer.
// Former home of the Habits tab (the tab was retired in the production
// layout): every habit shows its 7-day list card or monthly heatmap, with the
// full edit / delete / reminder / calendar flows preserved from the old screen.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useHabits } from '../hooks/useHabits';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { confirmAlert } from '../services/alertCompat';
import { getFrequencyLabel } from '../services/recurrenceService';
import type { Habit, ReminderConfig } from '../services/types';
import { HabitListCard } from '../components/feature/HabitListCard';
import { HabitHeatmap } from '../components/feature/HabitHeatmap';
import { HabitCalendarModal } from '../components/feature/HabitCalendarModal';
import { ReminderModal } from '../components/feature/ReminderModal';
import { ReminderManagerModal } from '../components/feature/ReminderManagerModal';
import type { ReminderDefaults } from '../components/feature/ReminderModal';

type ManagerView = 'list' | 'heatmap';
type SectionFilter = 'all' | string;

export default function HabitsManagerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    habits,
    completions,
    sections,
    categories,
    deleteHabit,
  } = useHabits();

  const [view, setView] = useState<ManagerView>('list');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');

  // ── Calendar / reminder flows (parity with the old Habits tab) ──
  const [calendarHabit, setCalendarHabit] = useState<Habit | null>(null);
  const [reminderHabit, setReminderHabit] = useState<Habit | null>(null);
  const [showReminderEditor, setShowReminderEditor] = useState(false);
  const [reminderToEdit, setReminderToEdit] = useState<ReminderConfig | undefined>(undefined);
  const [reminderDefaults, setReminderDefaults] = useState<ReminderDefaults>({
    type: 'alarm',
    sound: true,
  });
  const [managerRefresh, setManagerRefresh] = useState(0);
  const [cameFromManager, setCameFromManager] = useState(false);

  const sectionName = (id: string) => sections.find((s) => s.id === id)?.name ?? id;

  const completionSet = useMemo(
    () => new Set(
      completions
        .filter((c) => c.completed)
        .map((c) => `${c.habitId}_${c.date}`)
    ),
    [completions]
  );

  const visible = useMemo(
    () => (sectionFilter === 'all'
      ? habits
      : habits.filter((h) => h.sectionId === sectionFilter)),
    [habits, sectionFilter]
  );

  const reloadReminderCounts = useCallback(async () => {
    // HabitListCard renders its own reminder state via HabitOptionsModal; this
    // bump only invalidates listeners (schedule engine handles the rest).
    const { rebuildAllSchedules } = await import('../services/notificationService');
    try { await rebuildAllSchedules(); } catch {}
    setManagerRefresh((k) => k + 1);
  }, []);

  const [showReminderManager, setShowReminderManagerState] = useState(false);

  const openReminderManager = useCallback(async (habit: Habit) => {
    const habSrv = await import('../services/habitService');
    const settings = await habSrv.loadNotificationSettings();
    setReminderToEdit(undefined);
    setCameFromManager(false);
    setReminderHabit(habit);
    setReminderDefaults({
      type: settings.defaultType ?? 'alarm',
      sound: settings.defaultSound,
    });
    setShowReminderManagerState(true);
    setManagerRefresh((k) => k + 1);
  }, []);

  /** Manager → editor (edit an existing reminder or start a new one). */
  const openReminderEditor = useCallback(async (reminder?: ReminderConfig) => {
    const habSrv = await import('../services/habitService');
    const settings = await habSrv.loadNotificationSettings();
    setReminderToEdit(reminder);
    setCameFromManager(true);
    setShowReminderManagerState(false);
    setReminderDefaults({
      type: settings.defaultType ?? 'alarm',
      sound: settings.defaultSound,
    });
    setShowReminderEditor(true);
  }, []);

  const handleSaveReminder = useCallback(async (
    reminder: ReminderConfig,
    originalToClear?: ReminderConfig
  ) => {
    const { saveReminder, deleteReminder, deleteRemindersForHabit, loadNotificationSettings } = await import('../services/habitService');
    const { scheduleReminder, cancelReminderSchedules, cancelSchedulesByHabit } = await import('../services/notificationService');

    const habit = habits.find((h) => h.id === reminder.habitId);
    const settings = await loadNotificationSettings();

    if (reminder.type === 'none') {
      // "None" clears ONLY the reminder being edited — its original schedule
      // and stored config are cancelled by identity. Wiping the whole habit
      // here used to destroy the user's other alarms too.
      if (originalToClear) {
        await cancelReminderSchedules(originalToClear);
        await deleteReminder(originalToClear);
      } else {
        // Fresh reminder picked 'none': the picker's own hint is "remove ALL
        // reminders for this habit". The freshly built config was never
        // stored, so an identity-based deleteReminder matched nothing and
        // the rebuild below re-scheduled every stored row — a net no-op.
        // Purge the store so nothing re-schedules.
        await cancelSchedulesByHabit(reminder.habitId);
        await deleteRemindersForHabit(reminder.habitId);
      }
    } else if (habit) {
      // An edit that changed time/mode leaves the OLD identity scheduled and
      // stored — cancel + delete it first so re-saves never stack duplicates.
      if (originalToClear) {
        await cancelReminderSchedules(originalToClear);
        await deleteReminder(originalToClear);
      }
      // scheduleReminder cancels the previous schedules of the same identity,
      // so re-saving never stacks duplicates.
      await scheduleReminder(reminder, habit, settings);
      await saveReminder(reminder);
    }

    await reloadReminderCounts();
  }, [habits, reloadReminderCounts]);

  const handleDelete = (id: string, name: string) => {
    confirmAlert('Delete Habit', `Delete "${name}"? Completion history is removed too.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => { void deleteHabit(id); },
      },
    ]);
  };

  const renderSectionPill = (key: SectionFilter, label: string, count: number) => {
    const sel = sectionFilter === key;
    return (
      <Pressable
        key={key}
        style={[styles.pill, sel && styles.pillSel]}
        onPress={() => { setSectionFilter(key); }}
      >
        <Text style={[styles.pillText, sel && styles.pillTextSel]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.pillCount, sel && styles.pillTextSel]}>{count}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>All Habits</Text>
        <Pressable style={styles.addBtn} onPress={() => router.push('/add-habit')} hitSlop={8}>
          <MaterialIcons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Section filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillRow}
        contentContainerStyle={styles.pillRowInner}
      >
        {renderSectionPill('all', 'All', habits.length)}
        {sections.map((s) => {
          const count = habits.filter((h) => h.sectionId === s.id).length;
          return renderSectionPill(s.id, s.name, count);
        })}
      </ScrollView>

      {/* View switcher */}
      <View style={styles.viewRow}>
        <Pressable
          style={[styles.viewBtn, view === 'list' && styles.viewBtnSel]}
          onPress={() => { setView('list'); }}
        >
          <MaterialIcons
            name="format-list-bulleted"
            size={18}
            color={view === 'list' ? '#fff' : Colors.textSecondary}
          />
          <Text style={[styles.viewBtnText, view === 'list' && styles.viewBtnTextSel]}>List</Text>
        </Pressable>
        <Pressable
          style={[styles.viewBtn, view === 'heatmap' && styles.viewBtnSel]}
          onPress={() => { setView('heatmap'); }}
        >
          <MaterialIcons
            name="calendar-month"
            size={18}
            color={view === 'heatmap' ? '#fff' : Colors.textSecondary}
          />
          <Text style={[styles.viewBtnText, view === 'heatmap' && styles.viewBtnTextSel]}>Calendar</Text>
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {visible.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="spa" size={42} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No habits here yet</Text>
            <Text style={styles.emptyDesc}>
              Spawn one with the + button — every habit starts its own level journey.
            </Text>
          </View>
        ) : view === 'list' ? (
          visible.map((habit) => (
            <HabitListCard
              key={habit.id}
              habit={habit}
              completionSet={completionSet}
              customCategories={categories}
              onDelete={() => handleDelete(habit.id, habit.name)}
              onEdit={() => router.push(`/add-habit?editId=${habit.id}`)}
              onCalendar={() => setCalendarHabit(habit)}
              onReminder={() => { void openReminderManager(habit); }}
            />
          ))
        ) : (
          visible.map((habit) => (
            <View key={habit.id} style={styles.heatWrap}>
              <Text style={styles.sectionLabel}>{sectionName(habit.sectionId)}</Text>
              <HabitHeatmap
                habit={habit}
                completions={completions}
                customCategories={categories}
              />
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Flows ── */}
      {calendarHabit && (
        <HabitCalendarModal
          visible={calendarHabit !== null}
          habit={calendarHabit}
          completions={completions}
          onClose={() => setCalendarHabit(null)}
        />
      )}

      <ReminderModal
        visible={showReminderEditor}
        habitId={reminderHabit?.id ?? ''}
        habitName={reminderHabit?.name}
        habitFrequencyLabel={reminderHabit ? getFrequencyLabel(reminderHabit.frequency) : undefined}
        initial={reminderToEdit}
        defaults={reminderDefaults}
        onClose={() => {
          setShowReminderEditor(false);
          setReminderToEdit(undefined);
          if (cameFromManager) {
            // Back into the manager list, refreshed with the latest storage.
            setCameFromManager(false);
            setShowReminderManagerState(true);
            setManagerRefresh((k) => k + 1);
          } else {
            setReminderHabit(null);
          }
        }}
        onSave={(r, originalToClear) => {
          void handleSaveReminder(r, originalToClear).then(() => {
            setShowReminderEditor(false);
            setShowReminderManagerState(true);
            setManagerRefresh((k) => k + 1);
          });
        }}
      />

      <ReminderManagerModal
        visible={showReminderManager}
        habit={reminderHabit}
        refreshKey={managerRefresh}
        onClose={() => {
          setShowReminderManagerState(false);
          setReminderHabit(null);
        }}
        onEditReminder={(reminder) => { void openReminderEditor(reminder); }}
        onAddReminder={() => { void openReminderEditor(undefined); }}
        onChanged={() => { void reloadReminderCounts(); }}
      />
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillRow: {
    maxHeight: 46,
  },
  pillRowInner: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    paddingBottom: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillSel: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
    maxWidth: 160,
  },
  pillTextSel: {
    color: '#fff',
  },
  pillCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
  },
  viewRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  viewBtnSel: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  viewBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  viewBtnTextSel: {
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  list: {
    paddingHorizontal: Spacing.md,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  heatWrap: {
    marginBottom: Spacing.md,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: 64,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  emptyDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
