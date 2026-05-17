// Powered by OnSpace.AI
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { useHabits } from '../../hooks/useHabits';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { Habit } from '../../services/types';
import { formatDate, parseDate } from '../../services/recurrenceService';
import { HabitListCard } from '../../components/feature/HabitListCard';
import { HabitHeatmap } from '../../components/feature/HabitHeatmap';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getLastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(formatDate(d));
  }
  return days;
}

type ViewMode = 'list' | 'grid';

export default function HabitsScreen() {
  const insets = useSafeAreaInsets();
  const { habits, completions, deleteHabit, archiveHabit, selectedSectionId, categories } = useHabits();

  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [reorderMode, setReorderMode] = useState(false);

  const completionSet = useMemo(() => {
    return new Set(completions.filter((c) => c.completed).map((c) => c.key));
  }, [completions]);

  const activeHabits = useMemo(
    () => habits.filter((h) => !h.archived && h.sectionId === selectedSectionId).sort((a, b) => a.order - b.order),
    [habits, selectedSectionId]
  );
  const archivedHabits = useMemo(
    () => habits.filter((h) => h.archived && h.sectionId === selectedSectionId).sort((a, b) => a.order - b.order),
    [habits, selectedSectionId]
  );

  const displayHabits = tab === 'active' ? activeHabits : archivedHabits;

  const handleDelete = useCallback(async (id: string) => {
    Alert.alert('Delete Habit', 'Are you sure you want to delete this habit?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteHabit(id) },
    ]);
  }, [deleteHabit]);

  const handleArchive = useCallback(async (id: string) => {
    await archiveHabit(id, true);
  }, [archiveHabit]);

  const handleUnarchive = useCallback(async (id: string) => {
    await archiveHabit(id, false);
  }, [archiveHabit]);

  const renderItem = useCallback(
    ({ item }: { item: Habit; index: number }) => (
      <View>
        {viewMode === 'grid' ? (
          <View style={styles.heatmapCard}>
            <HabitHeatmap habit={item} completions={completions} customCategories={categories} />
          </View>
        ) : (
          <HabitListCard
            habit={item}
            completionSet={completionSet}
            onDelete={() => handleDelete(item.id)}
            onEdit={undefined}
            customCategories={categories}
          />
        )}
        {tab === 'archived' && (
          <Pressable style={styles.restoreBtn} onPress={() => handleUnarchive(item.id)}>
            <MaterialIcons name="unarchive" size={16} color={Colors.primary} />
            <Text style={styles.restoreBtnText}>Restore</Text>
          </Pressable>
        )}
      </View>
    ),
    [completionSet, completions, handleDelete, handleUnarchive, tab, viewMode, categories]
  );

  const weekDays = getLastNDays(7);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header tabs */}
      <View style={styles.header}>
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabBtn, tab === 'active' && styles.tabBtnActive]}
            onPress={() => setTab('active')}
          >
            <Text style={[styles.tabBtnText, tab === 'active' && styles.tabBtnTextActive]}>
              Active habits
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, tab === 'archived' && styles.tabBtnActive]}
            onPress={() => setTab('archived')}
          >
            <Text style={[styles.tabBtnText, tab === 'archived' && styles.tabBtnTextActive]}>
              Archived habits
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.menuBtn}
          onPress={() => setReorderMode((v) => !v)}
          hitSlop={8}
        >
          <MaterialIcons name="menu" size={22} color={Colors.textPrimary} />
        </Pressable>
      </View>

      {/* Reorder hint */}
      {reorderMode && (
        <View style={styles.reorderBanner}>
          <MaterialIcons name="drag-indicator" size={18} color={Colors.warning} />
          <Text style={styles.reorderText}>Long press and drag to reorder habits</Text>
          <Pressable onPress={() => setReorderMode(false)}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      )}

      {/* Day strip (list mode only) */}
      {viewMode === 'list' && (
        <View style={styles.dayStrip}>
          {weekDays.map((day) => {
            const d = parseDate(day);
            const label = DAY_NAMES[d.getDay()];
            const dayNum = d.getDate();
            return (
              <View key={day} style={styles.dayStripItem}>
                <Text style={styles.dayStripLabel}>{label}</Text>
                <Text style={styles.dayStripNum}>{dayNum}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Empty state */}
      {displayHabits.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons
            name={tab === 'archived' ? 'archive' : 'add-task'}
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {tab === 'archived' ? 'No archived habits' : 'No habits yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {tab === 'archived'
              ? 'Archive habits from the active tab'
              : 'Add your first habit using the + button'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayHabits}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          numColumns={1}
          key={viewMode}
        />
      )}

      {/* Bottom right view toggle */}
      <View style={[styles.viewToggle, { bottom: insets.bottom + 80 }]}>
        <Pressable
          style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
          onPress={() => setViewMode('list')}
        >
          <MaterialIcons
            name="view-list"
            size={20}
            color={viewMode === 'list' ? '#fff' : Colors.textSecondary}
          />
        </Pressable>
        <Pressable
          style={[styles.viewToggleBtn, viewMode === 'grid' && styles.viewToggleBtnActive]}
          onPress={() => setViewMode('grid')}
        >
          <MaterialIcons
            name="grid-view"
            size={20}
            color={viewMode === 'grid' ? '#fff' : Colors.textSecondary}
          />
        </Pressable>
      </View>
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
  tabRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    padding: 3,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  tabBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  tabBtnTextActive: {
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  reorderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.warning}10`,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 0.5,
    borderColor: `${Colors.warning}50`,
  },
  reorderText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.warning,
    fontWeight: FontWeight.medium,
  },
  doneBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  dayStrip: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  dayStripItem: {
    flex: 1,
    alignItems: 'center',
  },
  dayStripLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  dayStripNum: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: Spacing.md,
  },
  heatmapCard: {
    marginBottom: Spacing.sm,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
    alignSelf: 'flex-end',
  },
  restoreBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  empty: {
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
  viewToggle: {
    position: 'absolute',
    right: Spacing.md,
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 4,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  viewToggleBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewToggleBtnActive: {
    backgroundColor: Colors.primary,
  },
});
