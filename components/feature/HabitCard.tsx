// Powered by OnSpace.AI
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CategoryDef, Habit } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { Checkbox } from '../ui/Checkbox';
import { HabitOptionsModal } from './HabitOptionsModal';
import { resolveCategory } from '../../utils/categoryResolver';
import { vibrateOnTap } from '../../services/soundService';
import { CategoryIcon } from './CategoryIcon';

interface Props {
  habit: Habit;
  completed: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit?: () => void;
  onReminder?: () => void;
  onCalendar?: () => void;
  drag?: () => void;
  isActive?: boolean;
  customCategories?: CategoryDef[];
}

export const HabitCard = React.memo(function HabitCard({ habit, completed, onToggle, onDelete, onEdit, onReminder, onCalendar, drag, isActive, customCategories }: Props) {
  const [showOptions, setShowOptions] = useState(false);
  const catConfig = resolveCategory(habit.category, customCategories);

  const handleToggle = useCallback(() => {
    vibrateOnTap();
    onToggle();
  }, [onToggle]);

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed && !drag && styles.pressed,
          isActive && styles.dragging,
        ]}
        onPress={drag ? undefined : handleToggle}
        onLongPress={drag}
        delayLongPress={200}
        accessibilityLabel={`Habit: ${habit.name}`}
      >
        {/* Drag Handle */}
        {drag && (
          <View style={styles.dragHandle}>
            <MaterialIcons name="drag-handle" size={22} color={Colors.textMuted} />
          </View>
        )}

        {/* Category Icon */}
        <View style={[styles.iconBox, { backgroundColor: catConfig.color }]}>
          <CategoryIcon icon={catConfig.icon} color={catConfig.color} size={22} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={[styles.name, completed && styles.nameCompleted]} numberOfLines={2}>
            {habit.name}
          </Text>
          <View style={styles.tagRow}>
            <View style={[styles.tag, { borderColor: catConfig.color }]}>
              <Text style={[styles.tagText, { color: catConfig.color }]}>{catConfig.name}</Text>
            </View>
            <View style={styles.priorityBadge}>
              <Text style={styles.priorityText}>P{habit.priority}</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Checkbox checked={completed} onToggle={handleToggle} size={30} />
          <Pressable
            onPress={() => setShowOptions(true)}
            hitSlop={8}
            style={styles.dotsBtn}
          >
            <MaterialIcons name="more-vert" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </Pressable>

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
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  pressed: { opacity: 0.85 },
  dragging: {
    opacity: 0.85,
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  dragHandle: {
    paddingRight: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
    lineHeight: 20,
  },
  nameCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tag: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  priorityBadge: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  priorityText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotsBtn: {
    padding: 4,
  },
});
