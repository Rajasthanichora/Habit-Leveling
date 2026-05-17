import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CategoryDef, Habit, HabitCompletion } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { formatDate, isHabitActiveOnDate } from '../../services/recurrenceService';
import { resolveCategory } from '../../utils/categoryResolver';
import { CategoryIcon } from './CategoryIcon';

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CELL = 36;
const GAP = 4;

interface Props {
  habit: Habit;
  completions: HabitCompletion[];
  customCategories?: CategoryDef[];
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function HabitHeatmap({ habit, completions, customCategories }: Props) {
  const today = new Date();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth();
  const todayStr = formatDate(today);

  const daysInMonth = getDaysInMonth(curYear, curMonth);
  const firstDay = getFirstDayOfMonth(curYear, curMonth);
  const catConfig = resolveCategory(habit.category, customCategories);

  const habitCompletions = useMemo(
    () => completions.filter((c) => c.habitId === habit.id),
    [completions, habit.id]
  );

  const getStatus = (day: number): 'completed' | 'ignored' | 'none' => {
    const dateStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!isHabitActiveOnDate(habit, dateStr)) return 'none';
    const comp = habitCompletions.find((c) => c.date === dateStr);
    if (comp?.completed) return 'completed';
    if (dateStr < todayStr) return 'ignored';
    return 'none';
  };

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return (
    <View style={styles.container}>
      {/* Habit header */}
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: catConfig.color }]}>
          <CategoryIcon icon={catConfig.icon} color={catConfig.color} size={18} />
        </View>
        <View style={styles.headerContent}>
          <Text style={styles.habitName} numberOfLines={1}>{habit.name}</Text>
          <Text style={styles.habitCategory}>{catConfig.name}</Text>
        </View>
      </View>

      {/* Month title */}
      <Text style={styles.monthTitle}>{MONTHS[curMonth]} {curYear}</Text>

      {/* Calendar */}
      <View style={styles.calendar}>
        {/* Day headers */}
        <View style={styles.row}>
          {DAY_HEADERS.map((h) => (
            <Text key={h} style={styles.dayHeader}>{h}</Text>
          ))}
        </View>

        {/* Week rows */}
        {weeks.map((w, wi) => (
          <View key={wi} style={styles.row}>
            {w.map((day, di) => {
              if (day === null) return <View key={`e-${di}`} style={styles.cell} />;
              const status = getStatus(day);
              const isToday = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` === todayStr;
              const bg = status === 'completed'
                ? Colors.success
                : status === 'ignored'
                ? Colors.warning
                : '#1E1E1E';
              const txtColor = status === 'none' || status === 'ignored' ? Colors.textSecondary : '#fff';
              return (
                <View
                  key={day}
                  style={[
                    styles.cell,
                    { backgroundColor: bg },
                    isToday && styles.cellToday,
                  ]}
                >
                  <Text style={[styles.dayNum, { color: txtColor }]}>{day}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
          <Text style={styles.legendText}>Completed</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
          <Text style={styles.legendText}>Ignored</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#1E1E1E' }]} />
          <Text style={styles.legendText}>Inactive</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  habitName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  habitCategory: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  monthTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  calendar: {
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  dayHeader: {
    width: CELL,
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellToday: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  dayNum: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
});
