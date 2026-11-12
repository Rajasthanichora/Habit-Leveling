import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

interface Props {
  visible: boolean;
  habitName: string;
  reminderCount?: number;
  onClose: () => void;
  onReminder: () => void;
  onCalendar: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function HabitOptionsModal({ visible, habitName, reminderCount, onClose, onReminder, onCalendar, onEdit, onDelete }: Props) {
  const insets = useSafeAreaInsets();
  const hasReminders = (reminderCount ?? 0) > 0;
  const options = [
    {
      icon: 'notifications' as const,
      label: hasReminders ? 'Reminders' : 'Add Reminder',
      badge: hasReminders ? String(reminderCount) : undefined,
      color: Colors.textPrimary,
      bg: Colors.surface,
      action: onReminder,
    },
    { icon: 'calendar-today' as const, label: 'Calendar', color: Colors.textPrimary, bg: Colors.surface, action: onCalendar },
    { icon: 'edit' as const, label: 'Edit Habit', color: Colors.textPrimary, bg: Colors.surface, action: onEdit },
    { icon: 'delete-outline' as const, label: 'Delete', color: Colors.danger, bg: `${Colors.danger}12`, action: onDelete },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* insets.bottom instead of a hard-coded 34px gap: respects the
            Android navigation bar under edge-to-edge and the iOS home bar. */}
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Handle indicator */}
          <View style={styles.handle} />

          {/* Habit name */}
          <Text style={styles.title} numberOfLines={1}>{habitName}</Text>
          <View style={styles.divider} />

          {/* Options */}
          {options.map((opt, idx) => (
            <Pressable
              key={opt.label}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: pressed ? opt.bg : 'transparent' },
                idx < options.length - 1 && styles.optionBorder,
              ]}
              onPress={() => { opt.action(); onClose(); }}
            >
              <View style={[styles.iconContainer, { backgroundColor: opt.bg }]}>
                <MaterialIcons name={opt.icon} size={18} color={opt.color} />
              </View>
              <Text style={[styles.optionText, { color: opt.color }]}>{opt.label}</Text>
              {opt.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{opt.badge}</Text>
                </View>
              )}
              <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
            </Pressable>
          ))}

          {/* Cancel */}
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { onClose(); }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  handle: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.separator,
    marginBottom: Spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    gap: 12,
  },
  optionBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  badge: {
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 2,
    marginRight: Spacing.xs,
  },
  badgeText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  cancelBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
});
