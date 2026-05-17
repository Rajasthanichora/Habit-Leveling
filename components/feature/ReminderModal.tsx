import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Switch, TextInput } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ReminderConfig, ReminderType } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { formatDate } from '../../services/recurrenceService';
import { CalendarPickerModal } from './CalendarPickerModal';

interface Props {
  visible: boolean;
  habitId: string;
  initial?: ReminderConfig;
  onClose: () => void;
  onSave: (reminder: ReminderConfig) => void;
}

const QUICK_TIMES = [
  { label: 'Morning', time: '08:00' },
  { label: 'Afternoon', time: '12:00' },
  { label: 'Evening', time: '18:00' },
  { label: 'Night', time: '21:00' },
];

export function ReminderModal({ visible, habitId, initial, onClose, onSave }: Props) {
  const today = formatDate(new Date());
  const [date, setDate] = useState(initial?.date ?? today);
  const [time, setTime] = useState(initial?.time ?? '09:00');
  const [customTime, setCustomTime] = useState('');
  const [type, setType] = useState<ReminderType>(initial?.type ?? 'notification');
  const [sound, setSound] = useState(initial?.sound ?? true);
  const [vibration, setVibration] = useState(initial?.vibration ?? true);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSave = () => {
    const finalTime = customTime || time;
    if (!date || !finalTime) return;
    onSave({ habitId, date, time: finalTime, type, sound, vibration });
    onClose();
  };

  const displayDate = date === today ? 'Today' : date;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={styles.title}>Add Reminder</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            {/* Date */}
            <Text style={styles.label}>DATE</Text>
            <Pressable style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
              <MaterialIcons name="calendar-today" size={18} color={Colors.primary} />
              <Text style={styles.dateText}>{displayDate}</Text>
              <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
            </Pressable>

            {/* Time */}
            <Text style={[styles.label, { marginTop: Spacing.md }]}>TIME</Text>
            <View style={styles.quickTimeRow}>
              {QUICK_TIMES.map((qt) => {
                const sel = !customTime && time === qt.time;
                return (
                  <Pressable
                    key={qt.time}
                    style={[styles.quickTimeBtn, sel && styles.quickTimeBtnSelected]}
                    onPress={() => { setTime(qt.time); setCustomTime(''); }}
                  >
                    <Text style={[styles.quickTimeLabel, sel && styles.quickTimeLabelSelected]}>
                      {qt.label}
                    </Text>
                    <Text style={[styles.quickTimeValue, sel && styles.quickTimeValueSelected]}>
                      {qt.time}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Custom time input */}
            <View style={styles.customTimeRow}>
              <Text style={styles.customTimePrefix}>Custom:</Text>
              <TextInput
                style={styles.customTimeInput}
                value={customTime}
                onChangeText={(t) => { setCustomTime(t); setTime(''); }}
                placeholder="HH:mm"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            {/* Reminder Type */}
            <Text style={[styles.label, { marginTop: Spacing.md }]}>REMINDER TYPE</Text>
            <View style={styles.typeRow}>
              {(['notification', 'alarm', 'none'] as ReminderType[]).map((t) => {
                const sel = type === t;
                return (
                  <Pressable
                    key={t}
                    style={[styles.typeBtn, sel && styles.typeBtnSelected]}
                    onPress={() => setType(t)}
                  >
                    <MaterialIcons
                      name={t === 'notification' ? 'notifications' : t === 'alarm' ? 'alarm' : 'block'}
                      size={16}
                      color={sel ? '#fff' : Colors.textSecondary}
                    />
                    <Text style={[styles.typeBtnText, sel && styles.typeBtnTextSelected]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Sound */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Sound</Text>
              <Switch
                value={sound}
                onValueChange={setSound}
                trackColor={{ false: Colors.chipBg, true: Colors.primary }}
                thumbColor="#fff"
              />
            </View>

            {/* Vibration */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Vibration</Text>
              <Switch
                value={vibration}
                onValueChange={setVibration}
                trackColor={{ false: Colors.chipBg, true: Colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <Pressable style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Reminder</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <CalendarPickerModal
        visible={showDatePicker}
        selectedDate={date}
        onSelectDate={(d) => { setDate(d); setShowDatePicker(false); }}
        onClose={() => setShowDatePicker(false)}
        title="Select Date"
      />
    </>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: Spacing.sm,
  },
  dateText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  quickTimeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  quickTimeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  quickTimeBtnSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  quickTimeLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  quickTimeLabelSelected: { color: '#fff' },
  quickTimeValue: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
    marginTop: 2,
  },
  quickTimeValueSelected: { color: '#fff' },
  customTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  customTimePrefix: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  customTimeInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 6,
  },
  typeBtnSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  typeBtnTextSelected: {
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  switchLabel: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
