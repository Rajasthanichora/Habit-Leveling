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
    bg = 'transparent';
    borderColor = Colors.cardBorder;
    textColor = Colors.textMuted;
  } else if (completed) {
    bg = Colors.success;
    borderColor = Colors.success;
    textColor = '#fff';
  } else if (isPast) {
    bg = `${Colors.warning}20`;
    borderColor = `${Colors.warning}60`;
    textColor = Colors.warning;
  } else {
    bg = 'transparent';
    borderColor = 'rgba(255,255,255,0.1)';
    textColor = Colors.textSecondary;
  }

  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: bg, borderColor, borderWidth: isToday ? 1.5 : 1 },
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
            <View style={[styles.iconBox, { backgroundColor: `${catConfig.color}18` }]}>
              <CategoryIcon icon={catConfig.icon} color={catConfig.color} size={18} />
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
              hitSlop={10}
            >
              <MaterialIcons name="more-vert" size={18} color={Colors.textMuted} />
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
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: catConfig.color }]} />
            </View>
            <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
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
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  accent: {
    width: 3,
  },
  body: {
    flex: 1,
    padding: Spacing.md,
    paddingBottom: 10,
    paddingLeft: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: Spacing.sm,
  },
  iconBox: {
    width: 38,
    height: 38,
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
    marginBottom: 3,
  },
  freqBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
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
    gap: 5,
    marginBottom: 10,
    flexWrap: 'nowrap',
  },
  dot: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 36,
    minWidth: 26,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotText: {
    fontSize: 10,
    fontWeight: FontWeight.medium,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.progressBg,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  progressPct: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    minWidth: 28,
    textAlign: 'right',
  },
});
