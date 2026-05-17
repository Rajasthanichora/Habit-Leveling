import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useHabits } from '../hooks/useHabits';
import { Habit, Category, FrequencyType, FrequencyConfig, CategoryDef } from '../services/types';
import { CategoryConfig, Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { formatDate } from '../services/recurrenceService';
import { CalendarPickerModal } from '../components/feature/CalendarPickerModal';
import { CategoryIcon } from '../components/feature/CategoryIcon';
import { resolveCategory } from '../utils/categoryResolver';

const FREQUENCY_OPTIONS: { key: FrequencyType; label: string; icon: string }[] = [
  { key: 'hourly', label: 'Hourly', icon: 'av-timer' },
  { key: 'daily', label: 'Daily', icon: 'today' },
  { key: 'weekly', label: 'Weekly', icon: 'date-range' },
  { key: 'monthly', label: 'Monthly', icon: 'calendar-month' },
  { key: 'every_n_days', label: 'Every N Days', icon: 'repeat' },
  { key: 'some_days_per_period', label: 'Days per Period', icon: 'view-week' },
  { key: 'specific_days_of_year', label: 'Specific Days', icon: 'event' },
];

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={section.headerRow}>
      <Text style={section.headerText}>{title}</Text>
    </View>
  );
}

const section = StyleSheet.create({
  headerRow: {
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    paddingLeft: Spacing.sm,
  },
  headerText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

function getCategoryDef(catId: string, customCats: CategoryDef[]): { name: string; color: string; icon: string } {
  const def = CategoryConfig[catId];
  if (def) return { name: def.label, color: def.color, icon: def.icon };
  const custom = customCats.find((c) => c.id === catId);
  if (custom) return { name: custom.name, color: custom.color, icon: custom.icon || 'category' };
  return { name: catId, color: Colors.primary, icon: 'category' };
}

export default function AddHabitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addHabit, updateHabit, habits, categories } = useHabits();
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  const isEditing = !!editId;
  const existingHabit = isEditing ? habits.find((h) => h.id === editId) : null;

  const today = formatDate(new Date());

  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('Study');
  const [priority, setPriority] = useState(5);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [freqType, setFreqType] = useState<FrequencyType>('daily');

  const [everyNDays, setEveryNDays] = useState('2');
  const [daysPerPeriod, setDaysPerPeriod] = useState('3');
  const [periodDays, setPeriodDays] = useState('7');
  const [selectedWeekDays, setSelectedWeekDays] = useState<number[]>([1, 3, 5]);
  const [selectedMonthDays, setSelectedMonthDays] = useState<number[]>([1]);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);

  const allCategories: CategoryDef[] = useMemo(() => {
    const defaults = Object.entries(CategoryConfig).map(([id, cfg]) => ({
      id, name: cfg.label, color: cfg.color, icon: cfg.icon,
    }));
    return [...defaults, ...categories];
  }, [categories]);

  useEffect(() => {
    if (existingHabit) {
      setName(existingHabit.name);
      setCategory(existingHabit.category);
      setPriority(existingHabit.priority);
      setStartDate(existingHabit.startDate);
      setEndDate(existingHabit.endDate ?? '');
      setFreqType(existingHabit.frequency.type);
      if (existingHabit.frequency.everyNDays) setEveryNDays(String(existingHabit.frequency.everyNDays));
      if (existingHabit.frequency.daysPerPeriod) setDaysPerPeriod(String(existingHabit.frequency.daysPerPeriod));
      if (existingHabit.frequency.periodDays) setPeriodDays(String(existingHabit.frequency.periodDays));
      if (existingHabit.frequency.weekDays) setSelectedWeekDays(existingHabit.frequency.weekDays);
      if (existingHabit.frequency.monthDays) setSelectedMonthDays(existingHabit.frequency.monthDays);
    }
  }, [existingHabit]);

  const toggleWeekDay = (day: number) => {
    setSelectedWeekDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleMonthDay = (day: number) => {
    setSelectedMonthDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const buildFrequency = (): FrequencyConfig => {
    switch (freqType) {
      case 'every_n_days':
        return { type: freqType, everyNDays: parseInt(everyNDays) || 2 };
      case 'some_days_per_period':
        return {
          type: freqType,
          daysPerPeriod: parseInt(daysPerPeriod) || 3,
          periodDays: parseInt(periodDays) || 7,
        };
      case 'weekly':
        return { type: freqType, weekDays: selectedWeekDays };
      case 'monthly':
        return { type: freqType, monthDays: selectedMonthDays };
      default:
        return { type: freqType };
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter a habit name.');
      return;
    }
    if (isEditing && existingHabit) {
      const updated: Habit = {
        ...existingHabit,
        name: name.trim(),
        category,
        priority,
        startDate,
        endDate: endDate || undefined,
        frequency: buildFrequency(),
      };
      updateHabit(updated);
    } else {
      const habit: Habit = {
        id: `habit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: name.trim(),
        category,
        priority,
        startDate,
        endDate: endDate || undefined,
        frequency: buildFrequency(),
        createdAt: new Date().toISOString(),
        order: habits.length,
        sectionId: '',
      };
      addHabit(habit);
    }
    router.back();
  };

  const selectedCat = getCategoryDef(category, categories);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Habit' : 'New Habit'}</Text>
        <Pressable style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHeader title="General Information" />

          {/* Name */}
          <Text style={styles.label}>Habit Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Morning Run, Read 30 mins..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="done"
            accessibilityLabel="Habit name"
          />

          {/* Category - dropdown picker */}
          <Text style={[styles.label, { marginTop: Spacing.md }]}>Category</Text>
          <Pressable style={styles.pickerRow} onPress={() => setShowCategoryPicker(true)}>
            <View style={[styles.catIconSmall, { backgroundColor: selectedCat.color }]}>
              <CategoryIcon icon={selectedCat.icon || 'category'} color={selectedCat.color} size={18} />
            </View>
            <Text style={styles.pickerText}>{selectedCat.name}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textMuted} />
          </Pressable>

          {/* Start Date */}
          <Text style={[styles.label, { marginTop: Spacing.md }]}>Start Date</Text>
          <Pressable style={styles.dateRow} onPress={() => setShowStartPicker(true)}>
            <MaterialIcons name="calendar-today" size={20} color={Colors.primary} />
            <Text style={styles.dateText}>{startDate}</Text>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
          </Pressable>

          {/* Priority - flag button opens popup */}
          <Text style={[styles.label, { marginTop: Spacing.md }]}>Priority</Text>
          <Pressable style={styles.priorityRowNew} onPress={() => setShowPriorityPicker(true)}>
            <MaterialIcons name="flag" size={20} color={Colors.primary} />
            <Text style={styles.priorityText}>Priority {priority}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color={Colors.textMuted} />
          </Pressable>

          {/* End Date */}
          <Text style={[styles.label, { marginTop: Spacing.md }]}>End Date (Optional)</Text>
          <Pressable style={styles.dateRow} onPress={() => setShowEndPicker(true)}>
            <MaterialIcons name="event" size={20} color={Colors.primary} />
            <Text style={[styles.dateText, !endDate && { color: Colors.textMuted }]}>
              {endDate || 'No end date'}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textMuted} />
          </Pressable>
          {endDate ? (
            <Pressable onPress={() => setEndDate('')} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Clear end date</Text>
            </Pressable>
          ) : null}

          {/* ── Frequency ── */}
          <SectionHeader title="Frequency" />

          <View style={styles.freqGrid}>
            {FREQUENCY_OPTIONS.map((opt) => {
              const sel = opt.key === freqType;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.freqOption, sel && styles.freqOptionSelected]}
                  onPress={() => setFreqType(opt.key)}
                >
                  <MaterialIcons
                    name={opt.icon as any}
                    size={20}
                    color={sel ? '#fff' : Colors.textSecondary}
                  />
                  <Text style={[styles.freqLabel, sel && styles.freqLabelSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Frequency extras */}
          {freqType === 'every_n_days' && (
            <View style={styles.freqExtra}>
              <Text style={styles.label}>Repeat every</Text>
              <View style={styles.nDayRow}>
                <Pressable
                  style={styles.nDayBtn}
                  onPress={() => setEveryNDays((v) => String(Math.max(1, parseInt(v) - 1)))}
                >
                  <MaterialIcons name="remove" size={18} color={Colors.textPrimary} />
                </Pressable>
                <TextInput
                  style={styles.nDayInput}
                  value={everyNDays}
                  onChangeText={setEveryNDays}
                  keyboardType="number-pad"
                  textAlign="center"
                />
                <Pressable
                  style={styles.nDayBtn}
                  onPress={() => setEveryNDays((v) => String(parseInt(v) + 1))}
                >
                  <MaterialIcons name="add" size={18} color={Colors.textPrimary} />
                </Pressable>
                <Text style={[styles.label, { marginLeft: 8, marginBottom: 0 }]}>days</Text>
              </View>
            </View>
          )}

          {freqType === 'some_days_per_period' && (
            <View style={styles.freqExtra}>
              <Text style={styles.label}>Complete</Text>
              <View style={styles.nDayRow}>
                <TextInput
                  style={styles.nDayInput}
                  value={daysPerPeriod}
                  onChangeText={setDaysPerPeriod}
                  keyboardType="number-pad"
                  textAlign="center"
                />
                <Text style={[styles.label, { marginHorizontal: 8, marginBottom: 0 }]}>
                  days per
                </Text>
                <TextInput
                  style={styles.nDayInput}
                  value={periodDays}
                  onChangeText={setPeriodDays}
                  keyboardType="number-pad"
                  textAlign="center"
                />
                <Text style={[styles.label, { marginLeft: 8, marginBottom: 0 }]}>days</Text>
              </View>
            </View>
          )}

          {freqType === 'weekly' && (
            <View style={styles.freqExtra}>
              <Text style={styles.label}>Select days of the week</Text>
              <View style={styles.weekDayRow}>
                {WEEK_DAYS.map((dayName, idx) => {
                  const sel = selectedWeekDays.includes(idx);
                  return (
                    <Pressable
                      key={idx}
                      style={[styles.weekDayBtn, sel && styles.weekDayBtnSelected]}
                      onPress={() => toggleWeekDay(idx)}
                    >
                      <Text style={[styles.weekDayText, sel && styles.weekDayTextSelected]}>
                        {dayName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {freqType === 'monthly' && (
            <View style={styles.freqExtra}>
              <Text style={styles.label}>Select days of the month</Text>
              <View style={styles.monthDayGrid}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                  const sel = selectedMonthDays.includes(day);
                  return (
                    <Pressable
                      key={day}
                      style={[styles.monthDayBtn, sel && styles.monthDayBtnSelected]}
                      onPress={() => toggleMonthDay(day)}
                    >
                      <Text style={[styles.monthDayText, sel && styles.monthDayTextSelected]}>
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {freqType === 'specific_days_of_year' && (
            <View style={styles.freqExtra}>
              <Text style={styles.infoText}>
                This habit will appear only on specific calendar dates you define in the app.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Calendar pickers */}
      <CalendarPickerModal
        visible={showStartPicker}
        selectedDate={startDate}
        onSelectDate={setStartDate}
        onClose={() => setShowStartPicker(false)}
        title="Select Start Date"
      />
      <CalendarPickerModal
        visible={showEndPicker}
        selectedDate={endDate || today}
        onSelectDate={setEndDate}
        onClose={() => setShowEndPicker(false)}
        title="Select End Date"
      />

      {/* Category Picker Modal */}
      <Modal visible={showCategoryPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <Pressable onPress={() => setShowCategoryPicker(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {allCategories.map((cat) => {
                const sel = cat.id === category;
                return (
                  <Pressable
                    key={cat.id}
                    style={[styles.catOptionRow, sel && styles.catOptionSelected]}
                    onPress={() => { setCategory(cat.id); setShowCategoryPicker(false); }}
                  >
                    <View style={[styles.catIconSmall, { backgroundColor: cat.color }]}>
                      <CategoryIcon icon={cat.icon || 'category'} color={cat.color} size={18} />
                    </View>
                    <Text style={[styles.catOptionText, sel && { color: Colors.primary, fontWeight: FontWeight.bold }]}>
                      {cat.name}
                    </Text>
                    {sel && <MaterialIcons name="check" size={20} color={Colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Priority Picker Modal */}
      <Modal visible={showPriorityPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.priorityModalContent, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Priority</Text>
              <Pressable onPress={() => setShowPriorityPicker(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
              </Pressable>
            </View>
            <View style={styles.prioritySelector}>
              <Pressable
                style={styles.priorityArrow}
                onPress={() => setPriority((p) => Math.max(1, p - 1))}
              >
                <MaterialIcons name="chevron-left" size={32} color={Colors.primary} />
              </Pressable>
              <View style={styles.priorityDisplay}>
                <MaterialIcons name="flag" size={28} color={priority <= 3 ? '#4CAF50' : priority <= 7 ? '#FF9500' : '#FF3B5C'} />
                <Text style={styles.priorityNumber}>{priority}</Text>
              </View>
              <Pressable
                style={styles.priorityArrow}
                onPress={() => setPriority((p) => Math.min(10, p + 1))}
              >
                <MaterialIcons name="chevron-right" size={32} color={Colors.primary} />
              </Pressable>
            </View>
            <View style={styles.priorityScale}>
              <Text style={styles.priorityScaleText}>Low</Text>
              <View style={styles.priorityBar}>
                <View style={[styles.priorityFill, { width: `${priority * 10}%` }]} />
              </View>
              <Text style={styles.priorityScaleText}>High</Text>
            </View>
            <Pressable style={styles.saveBtn} onPress={() => setShowPriorityPicker(false)}>
              <Text style={styles.saveBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 9,
    borderRadius: Radius.full,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.inputBg,
    borderWidth: 0.5,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderWidth: 0.5,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    gap: Spacing.sm,
  },
  pickerText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  catIconSmall: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderWidth: 0.5,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    gap: Spacing.sm,
  },
  dateText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  clearBtn: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
  },
  clearBtnText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
  },
  priorityRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderWidth: 0.5,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    gap: Spacing.sm,
  },
  priorityText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  freqGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  freqOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    gap: 6,
    minWidth: '44%',
    flex: 1,
  },
  freqOptionSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  freqLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    flexShrink: 1,
  },
  freqLabelSelected: {
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  freqExtra: {
    marginTop: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  nDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  nDayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  nDayInput: {
    width: 56,
    height: 40,
    backgroundColor: Colors.inputBg,
    borderWidth: 0.5,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  weekDayRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  weekDayBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    minWidth: 44,
    alignItems: 'center',
  },
  weekDayBtnSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  weekDayText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  weekDayTextSelected: {
    color: '#fff',
    fontWeight: FontWeight.bold,
  },
  monthDayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  monthDayBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthDayBtnSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  monthDayText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  monthDayTextSelected: {
    color: '#fff',
    fontWeight: FontWeight.bold,
  },
  infoText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    maxHeight: '60%',
    borderTopWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  catOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
    borderRadius: Radius.md,
  },
  catOptionSelected: {
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.md,
  },
  catOptionText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  priorityModalContent: {
    maxHeight: '50%',
  },
  prioritySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingVertical: Spacing.xl,
  },
  priorityArrow: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  priorityDisplay: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  priorityNumber: {
    fontSize: 48,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  priorityScale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  priorityScaleText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  priorityBar: {
    flex: 1,
    height: 5,
    backgroundColor: Colors.progressBg,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  priorityFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
});
