import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Habit, ReminderConfig, ReminderRepeatMode } from '../../services/types';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

interface Props {
  visible: boolean;
  habit: Habit | null;
  /** Bump from the parent to force a re-read of storage. */
  refreshKey: number;
  onClose: () => void;
  /** Open the editor for one reminder (parent shows ReminderModal). */
  onEditReminder: (reminder: ReminderConfig) => void;
  /** Open the editor in "new reminder" mode. */
  onAddReminder: () => void;
  /** Notify the parent so badges / counts stay in sync. */
  onChanged: () => void;
}

const REPEAT_LABEL: Record<ReminderRepeatMode, string> = {
  off: 'One time',
  daily: 'Every day',
  habit: 'Habit days',
};

const REPEAT_ICON: Record<ReminderRepeatMode, string> = {
  off: 'event',
  daily: 'today',
  habit: 'repeat',
};

export function ReminderManagerModal({
  visible,
  habit,
  refreshKey,
  onClose,
  onEditReminder,
  onAddReminder,
  onChanged,
}: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ReminderConfig[]>([]);
  const [busy, setBusy] = useState(false);
  /** Master switch state — when off, nothing fires no matter what's listed. */
  const [masterOff, setMasterOff] = useState(false);
  /** Clock snapshot for past-due marking — updated outside render because
   * reading Date.now() while rendering is impure (one imperceptible frame
   * treats fresh rows as not-past before the effect lands). */
  const [nowTs, setNowTs] = useState<number | null>(null);
  useEffect(() => {
    setNowTs(Date.now());
  }, [items]);

  const reload = useCallback(async () => {
    if (!habit?.id) {
      setItems([]);
      return;
    }
    try {
      const { loadRemindersForHabit, loadNotificationSettings } = await import('../../services/habitService');
      const [list, settings] = await Promise.all([
        loadRemindersForHabit(habit.id),
        loadNotificationSettings(),
      ]);
      setItems(list);
      setMasterOff(settings.masterEnabled === false);
    } catch {
      setItems([]);
    }
  }, [habit]);

  useEffect(() => {
    if (!visible) return;
    void reload();
  }, [visible, refreshKey, reload]);

  const handleToggle = useCallback(
    async (reminder: ReminderConfig, enabled: boolean) => {
      if (!habit) return;
      setBusy(true);
      try {
        const habSrv = await import('../../services/habitService');
        const { scheduleReminder, cancelReminderSchedules } = await import('../../services/notificationService');
        const next: ReminderConfig = { ...reminder, enabled };
        await habSrv.saveReminder(next);
        if (enabled) {
          await scheduleReminder(next, habit);
        } else {
          await cancelReminderSchedules(next);
        }
        await reload();
        onChanged();
      } catch {}
      setBusy(false);
    },
    [habit, reload, onChanged]
  );

  const handleDelete = useCallback(
    async (reminder: ReminderConfig) => {
      setBusy(true);
      try {
        const { deleteReminder } = await import('../../services/habitService');
        const { cancelReminderSchedules } = await import('../../services/notificationService');
        await cancelReminderSchedules(reminder);
        await deleteReminder(reminder);
        await reload();
        onChanged();
      } catch {}
      setBusy(false);
    },
    [reload, onChanged]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom + Spacing.sm, Spacing.xl) }]}
          onPress={() => {}}
        >
          <View style={styles.header}>
            <View style={styles.headerTitles}>
              <Text style={styles.title}>Reminders</Text>
              {habit && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {habit.name}
                </Text>
              )}
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {masterOff && (
              <View style={styles.masterOffBanner}>
                <MaterialIcons name="notifications-off" size={18} color={Colors.danger} />
                <Text style={styles.masterOffText}>
                  Notifications are off in Settings — no reminder will fire until the master switch is on.
                </Text>
              </View>
            )}
            {items.length === 0 ? (
              <View style={styles.empty}>
                <MaterialIcons name="notifications-off" size={30} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No reminders yet</Text>
                <Text style={styles.emptyHint}>
                  Add one and we&apos;ll nudge you on the days this habit runs
                </Text>
              </View>
            ) : (
              items.map((r) => {
                const enabled = r.enabled !== false;
                const isAlarm = r.type === 'alarm';
                // One-time reminder whose moment already passed — it either
                // already fired or will never fire; mark it so the list stays
                // honest instead of showing a live-looking future alarm.
                const isOneShotPast =
                  nowTs !== null &&
                  (r.repeat ?? 'off') === 'off' &&
                  new Date(`${r.date}T${r.time}:00`).getTime() <= nowTs;
                return (
                  <View
                    key={`${r.habitId}|${r.time}|${r.repeat ?? 'off'}|${r.date}`}
                    style={[styles.row, !enabled && styles.rowDisabled]}
                  >
                    <View style={styles.rowIcon}>
                      <MaterialIcons
                        name={isAlarm ? 'alarm' : 'notifications-active'}
                        size={20}
                        color={enabled ? (isAlarm ? Colors.warning : Colors.primary) : Colors.textMuted}
                      />
                    </View>

                    <View style={styles.rowMain}>
                      <View style={styles.rowTop}>
                        <Text style={[styles.timeText, !enabled && styles.timeTextOff]}>{r.time}</Text>
                        <View style={styles.badges}>
                          <View
                            style={[
                              styles.badge,
                              isAlarm ? styles.badgeAlarm : styles.badgeNudge,
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                isAlarm ? styles.badgeTextAlarm : styles.badgeTextNudge,
                              ]}
                            >
                              {isAlarm ? 'Alarm' : r.type === 'remind' ? 'Nudge' : 'None'}
                            </Text>
                          </View>
                          <View style={styles.badge}>
                            <MaterialIcons
                              name={REPEAT_ICON[r.repeat ?? 'off'] as any}
                              size={12}
                              color={Colors.textSecondary}
                            />
                            <Text style={styles.badgeText}>
                              {REPEAT_LABEL[r.repeat ?? 'off']}
                            </Text>
                          </View>
                          {!enabled && (
                            <View style={[styles.badge, styles.badgeOff]}>
                              <Text style={[styles.badgeText, styles.badgeTextOff]}>OFF</Text>
                            </View>
                          )}
                          {enabled && isOneShotPast && (
                            <View style={[styles.badge, styles.badgeOff]}>
                              <Text style={[styles.badgeText, styles.badgeTextOff]}>PASSED</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {(r.repeat ?? 'off') !== 'habit' && (
                        <Text style={styles.metaText}>
                          {(r.repeat ?? 'off') === 'daily' ? 'Fires daily' : `One time · ${r.date}`}
                        </Text>
                      )}
                      {(r.repeat ?? 'off') === 'habit' && (
                        <Text style={styles.metaText}>Follows habit schedule</Text>
                      )}
                      {enabled && isOneShotPast && (
                        <Text style={[styles.metaText, { color: Colors.danger }]}>
                          This reminder&apos;s time has passed — it won&apos;t fire again
                        </Text>
                      )}
                    </View>

                    <View style={styles.rowActions}>
                      <Pressable onPress={() => { onEditReminder(r); }} hitSlop={8} style={styles.iconBtn}>
                        <MaterialIcons name="edit" size={20} color={Colors.textSecondary} />
                      </Pressable>
                      <Pressable onPress={() => { void handleDelete(r); }} hitSlop={8} style={styles.iconBtn}>
                        <MaterialIcons name="delete-outline" size={20} color={Colors.danger} />
                      </Pressable>
                      <Switch
                        value={enabled}
                        disabled={busy}
                        onValueChange={(val) => { void handleToggle(r, val); }}
                        trackColor={{ false: Colors.chipBg, true: Colors.primary }}
                        thumbColor="#fff"
                      />
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <Pressable style={styles.addBtn} onPress={() => { onAddReminder(); }}>
            <MaterialIcons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Add Reminder</Text>
          </Pressable>
        </Pressable>
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
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerTitles: {
    flex: 1,
    marginRight: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: Spacing.sm,
  },
  masterOffBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  masterOffText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.xs,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  emptyHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowIcon: {
    width: 34,
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  timeText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginRight: Spacing.xs,
  },
  timeTextOff: {
    color: Colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.chipBg,
  },
  badgeNudge: {
    backgroundColor: Colors.primaryGlow,
  },
  badgeAlarm: {
    backgroundColor: 'rgba(251,191,36,0.14)',
  },
  badgeOff: {
    backgroundColor: Colors.chipBg,
  },
  badgeText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  badgeTextNudge: {
    color: Colors.primary,
  },
  badgeTextAlarm: {
    color: Colors.warning,
  },
  badgeTextOff: {
    color: Colors.danger,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 3,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconBtn: {
    padding: Spacing.xs,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  addBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: '#fff',
  },
});
