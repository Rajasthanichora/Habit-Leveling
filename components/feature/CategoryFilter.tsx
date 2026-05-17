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
          const catColor = catConfig?.color;

          return (
            <Pressable
              key={f}
              onPress={() => onSelect(f)}
              style={({ pressed }) => [
                styles.chip,
                isSelected && styles.chipSelected,
                isSelected && catColor && !isAll && !isComplete
                  ? { borderColor: catColor, backgroundColor: `${catColor}18` }
                  : null,
                pressed && { opacity: 0.65 },
              ]}
            >
              {isAll && (
                <View style={[styles.checkIcon, isSelected && styles.checkIconSelected]}>
                  <MaterialIcons name="check" size={10} color={isSelected ? '#fff' : Colors.success} />
                </View>
              )}
              {isComplete && (
                <MaterialIcons
                  name="done-all"
                  size={13}
                  color={isSelected ? Colors.primary : Colors.textSecondary}
                  style={{ marginRight: 4 }}
                />
              )}
              {catConfig && !isAll && !isComplete && (
                <View style={[styles.catDot, { backgroundColor: catConfig.color }]} />
              )}
              <Text style={[
                styles.chipText,
                isSelected && styles.chipTextSelected,
                isSelected && catColor && !isAll && !isComplete ? { color: catColor } : null,
              ]}>
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
    paddingVertical: 6,
  },
  content: {
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    marginRight: Spacing.sm,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    height: 34,
  },
  chipSelected: {
    backgroundColor: Colors.primaryGlow,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  chipTextSelected: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  checkIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
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
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
  },
});
