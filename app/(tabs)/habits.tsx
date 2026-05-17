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
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
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
  const { habits, completions, deleteHabit, archiveHabit, selectedSectionId, categories, reorderHabits } = useHabits();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [reorderMode, setReorderMode] = useState(false);

  const completionSet = useMemo(() => {
    return new Set(completions.filter((c) => c.completed).map((c) => c.key));
  }, [completions]);

  const displayHabits = useMemo(
    () => habits.filter((h) => !h.archived && h.sectionId === selectedSectionId).sort((a, b) => a.order - b.order),
    [habits, selectedSectionId]
  );

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

  const handleDragEnd = useCallback(({ data }: { data: Habit[] }) => {
    reorderHabits(data);
    setReorderMode(false);
  }, [reorderHabits]);

  const renderDragItem = useCallback(({ item, drag, isActive }: RenderItemParams<Habit>) => (
    <Pressable
      onLongPress={drag}
      delayLongPress={100}
      style={{ opacity: isActive ? 0.8 : 1 }}
    >
      <HabitListCard
        habit={item}
        completionSet={completionSet}
        onDelete={() => handleDelete(item.id)}
        onEdit={undefined}
        customCategories={categories}
      />
    </Pressable>
  ), [completionSet, handleDelete, categories]);

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
      </View>
    ),
    [completionSet, completions, handleDelete, viewMode, categories]
  );

  const weekDays = getLastNDays(7);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Habits</Text>
        <Pressable
          style={[styles.menuBtn, reorderMode && styles.menuBtnActive]}
          onPress={() => setReorderMode((v) => !v)}
          hitSlop={8}
        >
          <MaterialIcons
            name={reorderMode ? 'check' : 'menu'}
            size={22}
            color={reorderMode ? '#fff' : Colors.textPrimary}
          />
        </Pressable>
      </View>

      {/* Reorder hint */}
      {reorderMode && (
        <View style={styles.reorderBanner}>
          <MaterialIcons name="drag-indicator" size={18} color={Colors.warning} />
          <Text style={styles.reorderText}>Drag to reorder habits. Tap ✓ when done.</Text>
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
          <MaterialIcons name="add-task" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No habits yet</Text>
          <Text style={styles.emptySubtitle}>
            Add your first habit using the + button
          </Text>
        </View>
      ) : reorderMode ? (
        <DraggableFlatList
          data={displayHabits}
          keyExtractor={(item) => item.id}
          renderItem={renderDragItem}
          onDragEnd={handleDragEnd}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        />
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
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
  menuBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
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
