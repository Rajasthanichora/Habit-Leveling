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
    { icon: 'notifications' as const, label: 'Add Reminder', color: Colors.textPrimary, action: onReminder },
    { icon: 'calendar-today' as const, label: 'Calendar', color: Colors.textPrimary, action: onCalendar },
    { icon: 'edit' as const, label: 'Edit', color: Colors.textPrimary, action: onEdit },
    { icon: 'delete-outline' as const, label: 'Delete', color: Colors.danger, action: onDelete },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title} numberOfLines={1}>{habitName}</Text>
          <View style={styles.divider} />
          {options.map((opt) => (
            <Pressable key={opt.label} style={styles.option} onPress={() => { vibrateOnTap(); opt.action(); onClose(); }}>
              <MaterialIcons name={opt.icon} size={20} color={opt.color} />
              <Text style={[styles.optionText, { color: opt.color }]}>{opt.label}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.option, styles.cancelOption]} onPress={() => { vibrateOnTap(); onClose(); }}>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  divider: { height: 1, backgroundColor: Colors.separator, marginBottom: Spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  optionText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  cancelOption: {
    justifyContent: 'center',
    marginTop: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  cancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
});
