// Powered by OnSpace.AI
import React, { useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { formatDate, parseDate } from '../../services/recurrenceService';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ITEM_WIDTH = 58;
const ITEM_MARGIN = 5;

interface Props {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

function getDaysAroundDate(centerDate: string, count = 30): string[] {
  const center = parseDate(centerDate);
  const days: string[] = [];
  const half = Math.floor(count / 2);
  for (let i = -half; i <= half; i++) {
    const d = new Date(center);
    d.setDate(d.getDate() + i);
    days.push(formatDate(d));
  }
  return days;
}

export function CalendarStrip({ selectedDate, onSelectDate }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const days = getDaysAroundDate(selectedDate, 60);
  const today = formatDate(new Date());

  useEffect(() => {
    const idx = days.indexOf(selectedDate);
    if (idx >= 0 && scrollRef.current) {
      const offset = idx * (ITEM_WIDTH + ITEM_MARGIN * 2) - 140;
      scrollRef.current.scrollTo({ x: Math.max(0, offset), animated: true });
    }
  }, [selectedDate]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {days.map((dateStr) => {
          const d = parseDate(dateStr);
          const dayName = DAY_NAMES[d.getDay()];
          const dayNum = d.getDate();
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;

          return (
            <Pressable
              key={dateStr}
              onPress={() => onSelectDate(dateStr)}
              style={({ pressed }) => [
                styles.dayItem,
                isSelected && styles.dayItemSelected,
                isToday && !isSelected && styles.dayItemToday,
                pressed && !isSelected && styles.dayItemPressed,
              ]}
            >
              <Text style={[styles.dayName, isSelected && styles.dayNameSelected, isToday && !isSelected && styles.dayNameToday]}>
                {dayName}
              </Text>
              <View style={[
                styles.dayNumContainer,
                isSelected && styles.dayNumContainerSelected,
              ]}>
                <Text style={[styles.dayNum, isSelected && styles.dayNumSelected, isToday && !isSelected && styles.dayNumToday]}>
                  {dayNum}
                </Text>
              </View>
              {isToday && !isSelected && <View style={styles.todayDot} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    paddingVertical: Spacing.sm,
  },
  content: {
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  dayItem: {
    width: ITEM_WIDTH,
    marginHorizontal: ITEM_MARGIN,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  dayItemSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  dayItemToday: {
    borderColor: 'rgba(78,142,255,0.35)',
    backgroundColor: Colors.primaryGlow,
  },
  dayItemPressed: {
    opacity: 0.65,
  },
  dayName: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    marginBottom: 4,
  },
  dayNameSelected: {
    color: 'rgba(255,255,255,0.85)',
  },
  dayNameToday: {
    color: Colors.primary,
  },
  dayNumContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayNumContainerSelected: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dayNum: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  dayNumSelected: {
    color: '#fff',
  },
  dayNumToday: {
    color: Colors.primary,
  },
  todayDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 3,
  },
});
