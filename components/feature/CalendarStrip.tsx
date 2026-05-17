// Powered by OnSpace.AI
import React, { useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { formatDate, parseDate } from '../../services/recurrenceService';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ITEM_WIDTH = 64;
const ITEM_MARGIN = 6;

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
                pressed && !isSelected && styles.dayItemPressed,
              ]}
            >
              <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
                {dayName}
              </Text>
              <View style={[styles.dayNumContainer, isSelected && styles.dayNumContainerSelected]}>
                <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>
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
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  dayItemSelected: {
    backgroundColor: Colors.primary,
  },
  dayItemPressed: {
    opacity: 0.7,
  },
  dayName: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginBottom: 4,
  },
  dayNameSelected: {
    color: '#fff',
  },
  dayNumContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.card,
  },
  dayNumContainerSelected: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dayNum: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  dayNumSelected: {
    color: '#fff',
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 3,
  },
});
