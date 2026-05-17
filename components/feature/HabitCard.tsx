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
          completed && styles.cardCompleted,
          pressed && !drag && styles.pressed,
          isActive && styles.dragging,
        ]}
        onPress={drag ? undefined : handleToggle}
        onLongPress={drag}
        delayLongPress={200}
        accessibilityLabel={`Habit: ${habit.name}`}
      >
        {/* Left accent bar */}
        <View style={[styles.accentBar, { backgroundColor: catConfig.color }]} />

        {/* Drag Handle */}
        {drag && (
          <View style={styles.dragHandle}>
            <MaterialIcons name="drag-handle" size={20} color={Colors.textMuted} />
          </View>
        )}

        {/* Category Icon */}
        <View style={[styles.iconBox, { backgroundColor: `${catConfig.color}18` }]}>
          <CategoryIcon icon={catConfig.icon} color={catConfig.color} size={20} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={[styles.name, completed && styles.nameCompleted]} numberOfLines={2}>
            {habit.name}
          </Text>
          <View style={styles.tagRow}>
            <View style={[styles.tag, { borderColor: `${catConfig.color}50`, backgroundColor: `${catConfig.color}10` }]}>
              <View style={[styles.tagDot, { backgroundColor: catConfig.color }]} />
              <Text style={[styles.tagText, { color: catConfig.color }]}>{catConfig.name}</Text>
            </View>
            <View style={styles.priorityBadge}>
              <Text style={styles.priorityText}>P{habit.priority}</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Checkbox checked={completed} onToggle={handleToggle} size={28} />
          <Pressable
            onPress={() => setShowOptions(true)}
            hitSlop={10}
            style={styles.dotsBtn}
          >
            <MaterialIcons name="more-vert" size={18} color={Colors.textMuted} />
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
  cardCompleted: {
    opacity: 0.55,
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  pressed: { opacity: 0.7 },
  dragging: {
    opacity: 0.9,
    backgroundColor: Colors.cardElevated,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  dragHandle: {
    paddingHorizontal: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    marginRight: Spacing.sm,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    marginRight: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 5,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 0.5,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  tagText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  priorityBadge: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  priorityText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: 10,
  },
  dotsBtn: {
    padding: 4,
  },
});
