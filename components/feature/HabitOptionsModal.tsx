import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { vibrateOnTap } from '../../services/soundService';

interface Props {
  visible: boolean;
  habitName: string;
  onClose: () => void;
  onReminder: () => void;
  onCalendar: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function HabitOptionsModal({ visible, habitName, onClose, onReminder, onCalendar, onEdit, onDelete }: Props) {
  const options = [
    { icon: 'notifications' as const, label: 'Add Reminder', color: Colors.textPrimary, bg: Colors.surface, action: onReminder },
    { icon: 'calendar-today' as const, label: 'Calendar', color: Colors.textPrimary, bg: Colors.surface, action: onCalendar },
    { icon: 'edit' as const, label: 'Edit Habit', color: Colors.textPrimary, bg: Colors.surface, action: onEdit },
    { icon: 'delete-outline' as const, label: 'Delete', color: Colors.danger, bg: `${Colors.danger}12`, action: onDelete },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
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
              onPress={() => { vibrateOnTap(); opt.action(); onClose(); }}
            >
              <View style={[styles.iconContainer, { backgroundColor: opt.bg }]}>
                <MaterialIcons name={opt.icon} size={18} color={opt.color} />
              </View>
              <Text style={[styles.optionText, { color: opt.color }]}>{opt.label}</Text>
              <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
            </Pressable>
          ))}

          {/* Cancel */}
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { vibrateOnTap(); onClose(); }}
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
  cancelBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  cancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
});
