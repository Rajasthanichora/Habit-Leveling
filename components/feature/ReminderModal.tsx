import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Switch, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ReminderConfig, ReminderRepeatMode, ReminderType } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { formatDate } from '../../services/recurrenceService';
import { CalendarPickerModal } from './CalendarPickerModal';

export interface ReminderDefaults {
  type: ReminderType;
  sound: boolean;
}

interface Props {
  visible: boolean;
  habitId: string;
  habitName?: string;
  habitFrequencyLabel?: string;
  initial?: ReminderConfig;
  defaults?: ReminderDefaults;
  onClose: () => void;
  onSave: (reminder: ReminderConfig, originalToClear?: ReminderConfig) => void;
}

const TYPE_OPTIONS: { value: Exclude<ReminderType, 'none'> | 'none'; label: string; icon: string; hint: string }[] = [
  { value: 'alarm', label: 'Alarm', icon: 'alarm', hint: 'Full attention: max priority, loud sound' },
  { value: 'remind', label: 'Nudge', icon: 'notifications-active', hint: 'Gentle reminder, lower priority' },
  { value: 'none', label: 'None', icon: 'notifications-off', hint: 'Remove all reminders for this habit' },
];

const REPEAT_OPTIONS: { value: ReminderRepeatMode; label: string; icon: string; hint: string }[] = [
  { value: 'off', label: 'One time', icon: 'event', hint: 'Fires once on the selected date' },
  { value: 'daily', label: 'Every day', icon: 'today', hint: 'Fires every day at this time' },
  { value: 'habit', label: 'Habit days', icon: 'repeat', hint: 'Fires on the days this habit is scheduled' },
];

export function ReminderModal({
  visible,
  habitId,
  habitName,
  habitFrequencyLabel,
  initial,
  defaults,
  onClose,
  onSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const today = formatDate(new Date());
  const [date, setDate] = useState(initial?.date ?? today);
  const [selectedTime, setSelectedTime] = useState(() => {
    const d = new Date();
    if (initial?.time) {
      const [h, m] = initial.time.split(':').map(Number);
      d.setHours(h, m, 0, 0);
    } else {
      d.setHours(9, 0, 0, 0);
    }
    return d;
  });
  const [type, setType] = useState<ReminderType>(initial?.type ?? defaults?.type ?? 'alarm');
  const [repeat, setRepeat] = useState<ReminderRepeatMode>(
    initial ? (initial.repeat ?? 'off') : 'daily'
  );
  const [sound, setSound] = useState(initial?.sound ?? defaults?.sound ?? true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Re-sync the form whenever the modal opens so editing stale values is
  // impossible (useState initializers only run on first mount).
  useEffect(() => {
    if (!visible) return;
    setDate(initial?.date ?? formatDate(new Date()));
    setSelectedTime(() => {
      const d = new Date();
      if (initial?.time) {
        const [h, m] = initial.time.split(':').map(Number);
        d.setHours(h, m, 0, 0);
      } else {
        d.setHours(9, 0, 0, 0);
      }
      return d;
    });
    setType(initial?.type ?? defaults?.type ?? 'alarm');
    setRepeat(initial ? (initial.repeat ?? 'off') : 'daily');
    setSound(initial?.sound ?? defaults?.sound ?? true);
    setShowDatePicker(false);
    setShowTimePicker(false);
  }, [visible, initial, defaults]);

  const handleSave = () => {
    const hh = String(selectedTime.getHours()).padStart(2, '0');
    const mm = String(selectedTime.getMinutes()).padStart(2, '0');
    const finalTime = `${hh}:${mm}`;
    if (!date || !finalTime) return;
    if (type === 'none') {
      // "None" removes the reminder being edited — pass its original config
      // through so the caller cancels ONLY this one (a 07:00 alarm must
      // survive deleting the 21:00 nudge).
      onSave(
        { habitId, date, time: finalTime, type: 'none', sound, repeat: 'off' },
        initial ? { ...initial } : undefined
      );
    } else if (initial) {
      // Editing: also hand the ORIGINAL config around so a changed time/mode
      // cancels the old schedule identity instead of stacking a second one.
      onSave({
        habitId,
        date,
        time: finalTime,
        type,
        sound,
        repeat,
        snoozeMinutes: initial.snoozeMinutes ?? 15,
        enabled: initial.enabled ?? true,
      }, { ...initial });
    } else {
      onSave({
        habitId,
        date,
        time: finalTime,
        type,
        sound,
        repeat,
        snoozeMinutes: 15,
        enabled: true,
      });
    }
    onClose();
  };

  const displayDate = date === today ? 'Today' : date;
  const timeStr = `${String(selectedTime.getHours()).padStart(2, '0')}:${String(selectedTime.getMinutes()).padStart(2, '0')}`;

  // One-time reminders aimed at a moment that already passed would be saved
  // but silently never fire — surface that BEFORE saving instead of letting
  // the user discover the mute alarm later. The clock is snapshotted in an
  // effect because reading Date.now() during render is impure.
  const [nowTs, setNowTs] = useState<number | null>(null);
  useEffect(() => {
    setNowTs(Date.now());
  }, [type, repeat, date, timeStr]);

  const oneShotInPast = useMemo(() => {
    if (type === 'none' || repeat !== 'off') return false;
    if (nowTs === null) return false;
    const when = new Date(`${date}T${timeStr}:00`);
    return when.getTime() <= nowTs;
  }, [type, repeat, date, timeStr, nowTs]);

  const onTimeChange = (_event: DateTimePickerEvent, d?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (d) setSelectedTime(d);
  };

  const activeType = TYPE_OPTIONS.find((t) => t.value === type);
  const activeRepeat = REPEAT_OPTIONS.find((r) => r.value === repeat);
  const isRemoved = type === 'none';

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + Spacing.sm, Spacing.xxl) }]} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={styles.title}>{initial ? 'Edit Reminder' : 'Add Reminder'}</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            {/* Notification style */}
            <Text style={styles.label}>NOTIFICATION STYLE</Text>
            <View style={styles.typeRow}>
              {TYPE_OPTIONS.map((t) => {
                const sel = type === t.value;
                return (
                  <Pressable
                    key={t.value}
                    style={[styles.typeBtn, sel && styles.typeBtnSelected]}
                    onPress={() => setType(t.value)}
                  >
                    <MaterialIcons
                      name={t.icon as any}
                      size={16}
                      color={sel ? '#fff' : Colors.textSecondary}
                    />
                    <Text style={[styles.typeBtnText, sel && styles.typeBtnTextSelected]}>
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!isRemoved && (
              <Text style={styles.hint}>{activeType?.hint}</Text>
            )}

            {/* Repeat mode */}
            {!isRemoved && (
              <>
                <Text style={[styles.label, { marginTop: Spacing.lg }]}>REPEAT</Text>
                <View style={styles.typeRow}>
                  {REPEAT_OPTIONS.map((r) => {
                    const sel = repeat === r.value;
                    return (
                      <Pressable
                        key={r.value}
                        style={[styles.typeBtn, sel && styles.typeBtnSelected]}
                        onPress={() => setRepeat(r.value)}
                      >
                        <MaterialIcons
                          name={r.icon as any}
                          size={16}
                          color={sel ? '#fff' : Colors.textSecondary}
                        />
                        <Text style={[styles.typeBtnText, sel && styles.typeBtnTextSelected]}>
                          {r.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {(repeat === 'daily' || repeat === 'habit') && (
                  <Text style={styles.hint}>
                    {repeat === 'daily'
                      ? activeRepeat?.hint
                      : `Follows habit schedule${habitFrequencyLabel ? `: ${habitFrequencyLabel}` : ''}`}
                  </Text>
                )}
              </>
            )}

            {/* Date — only meaningful for one-time reminders */}
            {!isRemoved && repeat === 'off' && (
              <>
                <Text style={[styles.label, { marginTop: Spacing.lg }]}>DATE</Text>
                <Pressable style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                  <MaterialIcons name="calendar-today" size={18} color={Colors.primary} />
                  <Text style={styles.dateText}>{displayDate}</Text>
                  <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
                </Pressable>
              </>
            )}

            {/* Time */}
            {!isRemoved && (
              <>
                <Text style={[styles.label, { marginTop: Spacing.lg }]}>TIME</Text>
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
              </>
            )}

            {/* One-time + already-past → honest heads-up instead of a silent no-show */}
            {oneShotInPast && (
              <Text style={[styles.hint, styles.hintWarn]}>
                This time has already passed — it will be saved but never fire. Pick a future date/time.
              </Text>
            )}

            {/* Reminder sound toggle */}
            {!isRemoved && (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Sound</Text>
                <Switch
                  value={sound}
                  onValueChange={setSound}
                  trackColor={{ false: Colors.chipBg, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            )}

            <Pressable style={[styles.saveBtn, isRemoved && styles.saveBtnDanger]} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{isRemoved ? 'Remove Reminders' : 'Save Reminder'}</Text>
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
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    marginLeft: 2,
  },
  hintWarn: {
    color: Colors.warning,
    fontWeight: FontWeight.semibold,
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
  saveBtnDanger: {
    backgroundColor: Colors.danger,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
