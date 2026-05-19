import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Switch, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
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

export function ReminderModal({ visible, habitId, initial, onClose, onSave }: Props) {
  const today = formatDate(new Date());
  const [date, setDate] = useState(initial?.date ?? today);
  const [selectedTime, setSelectedTime] = useState(() => {
    if (initial?.time) {
      const [h, m] = initial.time.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    }
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [type, setType] = useState<ReminderType>(initial?.type ?? 'alarm');
  const [sound, setSound] = useState(initial?.sound ?? true);
  const [vibration, setVibration] = useState(initial?.vibration ?? true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handleSave = () => {
    const hh = String(selectedTime.getHours()).padStart(2, '0');
    const mm = String(selectedTime.getMinutes()).padStart(2, '0');
    const finalTime = `${hh}:${mm}`;
    if (!date || !finalTime) return;
    onSave({ habitId, date, time: finalTime, type, sound, vibration });
    onClose();
  };

  const displayDate = date === today ? 'Today' : date;
  const timeStr = `${String(selectedTime.getHours()).padStart(2, '0')}:${String(selectedTime.getMinutes()).padStart(2, '0')}`;

  const onTimeChange = (_event: DateTimePickerEvent, d?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (d) setSelectedTime(d);
  };

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
            <Pressable style={styles.timePickerBtn} onPress={() => setShowTimePicker(true)}>
              <MaterialIcons name="access-time" size={20} color={Colors.primary} />
              <Text style={styles.timeText}>{timeStr}</Text>
              <MaterialIcons name="edit" size={18} color={Colors.textMuted} />
            </Pressable>
            {showTimePicker && (
              <DateTimePicker
                value={selectedTime}
                mode="time"
                display="spinner"
                onChange={onTimeChange}
              />
            )}

            {/* Reminder Type */}
            <Text style={[styles.label, { marginTop: Spacing.md }]}>REMINDER TYPE</Text>
            <View style={styles.typeRow}>
              {(['alarm', 'none'] as ReminderType[]).map((t) => {
                const sel = type === t;
                return (
                  <Pressable
                    key={t}
                    style={[styles.typeBtn, sel && styles.typeBtnSelected]}
                    onPress={() => setType(t)}
                  >
                    <MaterialIcons
                      name={t === 'alarm' ? 'alarm' : 'block'}
                      size={16}
                      color={sel ? '#fff' : Colors.textSecondary}
                    />
                    <Text style={[styles.typeBtnText, sel && styles.typeBtnTextSelected]}>
                      {t === 'alarm' ? 'Alarm' : 'None'}
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
  timePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    gap: Spacing.sm,
  },
  timeText: {
    flex: 1,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
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
