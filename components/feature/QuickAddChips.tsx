// Quick-add templates — one-tap prefill chips at the top of the New Habit
// form. Tapping never saves: it only fills the fields the user can still
// adjust before pressing Save.

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { Difficulty, FrequencyType } from '../../services/types';

export interface QuickTemplate {
  id: string;
  emoji: string;
  name: string;
  category: string;
  difficulty: Difficulty;
  frequency: FrequencyType;
  isQuantity: boolean;
  targetCount: string;
}

export const QUICK_TEMPLATES: QuickTemplate[] = [
  { id: 'water', emoji: '💧', name: 'Drink Water', category: 'Health', difficulty: 'easy', frequency: 'daily', isQuantity: true, targetCount: '8' },
  { id: 'read', emoji: '📖', name: 'Read 20 Mins', category: 'Study', difficulty: 'medium', frequency: 'daily', isQuantity: false, targetCount: '8' },
  { id: 'workout', emoji: '🏋️', name: 'Workout', category: 'Health', difficulty: 'hard', frequency: 'daily', isQuantity: false, targetCount: '8' },
  { id: 'stretch', emoji: '🧘', name: 'Stretch / Meditate', category: 'Other', difficulty: 'easy', frequency: 'daily', isQuantity: false, targetCount: '8' },
];

export function QuickAddChips({ onPick, disabled }: { onPick: (t: QuickTemplate) => void; disabled?: boolean }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {QUICK_TEMPLATES.map((t) => (
        <View key={t.id} style={styles.chipWrap}>
          <View style={styles.chipOuter} pointerEvents={disabled ? 'none' : 'auto'}>
            <Text
              style={styles.chipText}
              onPress={() => !disabled && onPick(t)}
              suppressHighlighting
            >
              {t.emoji} {t.name}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
    paddingVertical: 2,
  },
  chipWrap: {
    // wrapping view keeps pressable sizing predictable inside horizontal list
  },
  chipOuter: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingVertical: 7,
    paddingHorizontal: 13,
    minHeight: 34,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
});
