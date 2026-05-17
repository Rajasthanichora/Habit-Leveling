// Powered by OnSpace.AI
import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing, CategoryConfig } from '../../constants/theme';

export const FILTERS = ['All', 'Complete', 'Other', 'Health', 'Study', 'Work', 'Home'];

interface Props {
  active: string;
  onSelect: (filter: string) => void;
  completedCount: number;
}

export function CategoryFilter({ active, onSelect, completedCount }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {FILTERS.map((f) => {
          const isSelected = f === active;
          const isAll = f === 'All';
          const isComplete = f === 'Complete';
          const catConfig = CategoryConfig[f];

          return (
            <Pressable
              key={f}
              onPress={() => onSelect(f)}
              style={({ pressed }) => [
                styles.chip,
                isSelected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
            >
              {isAll && (
                <View style={[styles.checkIcon, isSelected && styles.checkIconSelected]}>
                  <MaterialIcons name="check" size={12} color={isSelected ? '#fff' : Colors.success} />
                </View>
              )}
              {isComplete && (
                <MaterialIcons
                  name="done-all"
                  size={14}
                  color={isSelected ? '#fff' : Colors.textSecondary}
                  style={{ marginRight: 4 }}
                />
              )}
              {catConfig && !isAll && !isComplete && (
                <View style={[styles.catDot, { backgroundColor: catConfig.color }]} />
              )}
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {isAll ? `${completedCount}` : f}
              </Text>
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
    paddingVertical: Spacing.xs,
  },
  content: {
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.chipBg,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    height: 36,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipPressed: { opacity: 0.7 },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  checkIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 5,
  },
  checkIconSelected: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
});
