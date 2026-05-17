// Powered by OnSpace.AI
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CategoryDef, Habit } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { formatDate, parseDate, isHabitActiveOnDate, getFrequencyLabel } from '../../services/recurrenceService';
import { HabitOptionsModal } from './HabitOptionsModal';
import { resolveCategory } from '../../utils/categoryResolver';
import { CategoryIcon } from './CategoryIcon';

const TODAY = new Date();

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - i);
    days.push(formatDate(d));
  }
  return days;
}

const LAST_7 = getLast7Days();

interface DateDotProps {
  date: string;
  completed: boolean;
  isActive: boolean;
  isToday: boolean;
}

function DateDot({ date, completed, isActive, isToday }: DateDotProps) {
  const d = parseDate(date);
  const day = d.getDate();
  const todayStr = formatDate(TODAY);
  const isPast = date < todayStr;

  let bg: string;
  let textColor: string;
  let borderColor: string;

  if (!isActive) {
    bg = '#1E1E1E';
    borderColor = '#333';
    textColor = Colors.textMuted;
  } else if (completed) {
    bg = Colors.success;
    borderColor = Colors.success;
    textColor = '#fff';
  } else if (isPast) {
    bg = Colors.warning;
    borderColor = Colors.warning;
    textColor = '#fff';
  } else {
    bg = 'transparent';
    borderColor = Colors.textMuted;
    textColor = Colors.textSecondary;
  }

  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: bg, borderColor, borderWidth: isToday ? 2 : 1.5 },
      ]}
    >
      <Text style={[styles.dotText, { color: textColor, fontWeight: isToday ? FontWeight.bold : FontWeight.medium }]}>
        {day}
      </Text>
    </View>
  );
}

interface Props {
  habit: Habit;
  completionSet: Set<string>;
  onDelete: () => void;
  onEdit?: () => void;
  onReminder?: () => void;
  onCalendar?: () => void;
  customCategories?: CategoryDef[];
}

export const HabitListCard = React.memo(function HabitListCard({
  habit,
  completionSet,
  onDelete,
  onEdit,
  onReminder,
  onCalendar,
  customCategories,
}: Props) {
  const [showOptions, setShowOptions] = useState(false);
  const catConfig = resolveCategory(habit.category, customCategories);
  const freqLabel = getFrequencyLabel(habit.frequency);
  const todayStr = formatDate(TODAY);

  const completedCount = LAST_7.filter(
    (d) => isHabitActiveOnDate(habit, d) && completionSet.has(`${habit.id}_${d}`)
  ).length;
  const activeCount = LAST_7.filter((d) => isHabitActiveOnDate(habit, d)).length;
  const progress = activeCount > 0 ? completedCount / activeCount : 0;

  return (
    <>
      <View style={styles.card}>
        {/* Left accent */}
        <View style={[styles.accent, { backgroundColor: catConfig.color }]} />

        <View style={styles.body}>
          {/* Top row */}
          <View style={styles.topRow}>
            <View style={[styles.iconBox, { backgroundColor: catConfig.color }]}>
              <CategoryIcon icon={catConfig.icon} color={catConfig.color} size={20} />
            </View>
            <View style={styles.nameBlock}>
              <Text style={styles.name} numberOfLines={1}>{habit.name}</Text>
              <View style={styles.freqBadge}>
                <Text style={styles.freqText}>{freqLabel}</Text>
              </View>
            </View>
            <Pressable
              style={styles.dotsBtn}
              onPress={() => setShowOptions(true)}
              hitSlop={8}
            >
              <MaterialIcons name="more-vert" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* Date dots */}
          <View style={styles.dotsRow}>
            {LAST_7.map((day) => {
              const isActive = isHabitActiveOnDate(habit, day);
              const isComp = completionSet.has(`${habit.id}_${day}`);
              const isToday = day === todayStr;
              return (
                <DateDot
                  key={day}
                  date={day}
                  completed={isComp}
                  isActive={isActive}
                  isToday={isToday}
                />
              );
            })}
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: catConfig.color }]} />
          </View>
        </View>
      </View>

      <HabitOptionsModal
        visible={showOptions}
        habitName={habit.name}
        onClose={() => setShowOptions(false)}
        onReminder={() => { setShowOptions(false); onReminder?.(); }}
        onCalendar={() => { setShowOptions(false); onCalendar?.(); }}
        onEdit={() => { setShowOptions(false); onEdit?.(); }}
        onDelete={() => { setShowOptions(false); onDelete(); }}
      />
    </>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  accent: {
    width: 4,
    borderTopLeftRadius: Radius.lg,
    borderBottomLeftRadius: Radius.lg,
  },
  body: {
    flex: 1,
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  nameBlock: {
    flex: 1,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  freqBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  freqText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  dotsBtn: {
    padding: 4,
    flexShrink: 0,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.sm,
    flexWrap: 'nowrap',
  },
  dot: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 38,
    minWidth: 28,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#444',
    backgroundColor: '#1E1E1E',
  },
  dotText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  progressTrack: {
    height: 3,
    backgroundColor: Colors.progressBg,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
});
