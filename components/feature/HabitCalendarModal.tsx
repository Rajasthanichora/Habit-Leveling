import React, { useState, useMemo } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Habit, HabitCompletion } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { formatDate, parseDate, isHabitActiveOnDate } from '../../services/recurrenceService';

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  visible: boolean;
  habit: Habit;
  completions: HabitCompletion[];
  onClose: () => void;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function HabitCalendarModal({ visible, habit, completions, onClose }: Props) {
  const today = formatDate(new Date());
  const initial = parseDate(habit.startDate);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const habitCompletions = useMemo(() => {
    return completions.filter((c) => c.habitId === habit.id);
  }, [completions, habit.id]);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const getDateStatus = (day: number): 'completed' | 'ignored' | 'upcoming' | null => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!isHabitActiveOnDate(habit, dateStr)) return null;

    const comp = habitCompletions.find((c) => c.date === dateStr);
    if (comp?.completed) return 'completed';
    if (comp && !comp.completed) return 'ignored';
    if (dateStr < today) return 'ignored';
    return 'upcoming';
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{habit.name}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* Month Nav */}
          <View style={styles.monthNav}>
            <Pressable onPress={prevMonth} hitSlop={8}>
              <MaterialIcons name="chevron-left" size={28} color={Colors.textPrimary} />
            </Pressable>
            <Text style={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
            <Pressable onPress={nextMonth} hitSlop={8}>
              <MaterialIcons name="chevron-right" size={28} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {/* Day Headers */}
          <View style={styles.dayHeaders}>
            {DAY_HEADERS.map((d) => (
              <Text key={d} style={styles.dayHeader}>{d}</Text>
            ))}
          </View>

          {/* Grid */}
          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (day === null) {
                return <View key={`empty-${i}`} style={styles.cell} />;
              }
              const status = getDateStatus(day);
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === today;

              return (
                <View key={dateStr} style={styles.cell}>
                  {status && (
                    <View
                      style={[
                        styles.dot,
                        status === 'completed' && styles.dotCompleted,
                        status === 'ignored' && styles.dotIgnored,
                        status === 'upcoming' && styles.dotUpcoming,
                      ]}
                    />
                  )}
                  <Text
                    style={[
                      styles.dayNum,
                      isToday && styles.dayNumToday,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotCompleted]} />
              <Text style={styles.legendText}>Completed</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotIgnored]} />
              <Text style={styles.legendText}>Ignored</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.dotUpcoming]} />
              <Text style={styles.legendText}>Upcoming</Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  monthLabel: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
    top: 4,
  },
  dotCompleted: {
    backgroundColor: Colors.success,
  },
  dotIgnored: {
    backgroundColor: Colors.warning,
  },
  dotUpcoming: {
    backgroundColor: Colors.textMuted,
  },
  dayNum: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  dayNumToday: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
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
