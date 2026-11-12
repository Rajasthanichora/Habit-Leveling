import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Modal,
  Switch,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { confirmAlert, infoAlert } from '../services/alertCompat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useHabits } from '../hooks/useHabits';
import { CategoryDef, NotificationSettings, ReminderConfig } from '../services/types';
import { CategoryConfig, Colors, FontSize, FontWeight, Radius, Spacing } from '../constants/theme';
import { CategoryIcon } from '../components/feature/CategoryIcon';
import { SVG_ICON_NAMES } from '../utils/svgIcons';
import { previewSound, getSfxCatalog } from '../services/soundService';
import { loadNotificationSettings, saveNotificationSettings, loadReminders } from '../services/habitService';
import { rebuildAllSchedules, scheduleTestNotification, getScheduledNotificationsOverview, cancelScheduledById, ScheduledNotificationOverview } from '../services/notificationService';
import { loadPenaltySettings, savePenaltySettings, PenaltySettings } from '../services/penaltyService';
import { PENALTY_PRESETS, DIFFICULTY_PRESETS, GameDifficulty } from '../services/gameRules';
import { applyDifficulty } from '../services/difficultyService';
import { fineMult, hpDamageMult } from '../services/skillService';
import { exportBackup, pickBackupFile, restoreFromBackup, BackupFile } from '../services/backupService';

const DEFAULT_COLORS = [
  '#FF6B35', '#FF3B5C', '#2979FF', '#9B59B6', '#2ECC71',
  '#E74C3C', '#F39C12', '#1ABC9C', '#3498DB', '#E91E63',
  '#00BCD4', '#FF9800', '#8BC34A', '#795548', '#607D8B',
  '#673AB7', '#FFEB3B', '#009688', '#CDDC39', '#FF5722',
];

const PRESET_ICONS = [
  'favorite', 'school', 'work', 'star', 'home',
  'directions-run', 'book', 'code', 'music-note', 'restaurant',
  'fitness-center', 'self-improvement', 'bedtime', 'water-drop', 'coffee',
  'pets', 'train', 'shopping-cart', 'brush', 'photo-camera',
];

type SettingsView = 'menu' | 'categories' | 'sound' | 'notifications' | 'game' | 'backup';

type NotifTimeField = 'digest' | 'guard' | 'brief' | 'nudge' | 'recap' | 'comeback' | 'qhStart' | 'qhEnd';

const KIND_LABELS: Record<ScheduledNotificationOverview['kind'], string> = {
  reminder: 'REMINDER',
  snooze: 'SNOOZE',
  smart: 'SMART',
  celebration: 'MILESTONE',
  test: 'TEST',
  other: 'OTHER',
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { habits, categories, addCategory, updateCategory, deleteCategory } = useHabits();

  const [view, setView] = useState<SettingsView>('menu');
  const [showForm, setShowForm] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryDef | null>(null);
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState(DEFAULT_COLORS[0]);
  const [formIcon, setFormIcon] = useState('');
  const [showActionsFor, setShowActionsFor] = useState<string | null>(null);

  const defaultCats: CategoryDef[] = useMemo(
    () => Object.entries(CategoryConfig).map(([id, cfg]) => ({
      id, name: cfg.label, color: cfg.color, icon: cfg.icon,
    })),
    []
  );

  const allCats = useMemo(() => [...defaultCats, ...categories], [defaultCats, categories]);

  // ── Notification Settings State ──
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [notifPerms, setNotifPerms] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const [notifTimeField, setNotifTimeField] = useState<NotifTimeField | null>(null);
  const [notifTimeValue, setNotifTimeValue] = useState<Date>(() => new Date());
  /** All saved reminders — powers the "Reminder Coverage" protection card. */
  const [reminders, setReminders] = useState<ReminderConfig[]>([]);

  useEffect(() => {
    if (view === 'notifications') {
      loadReminders().then(setReminders).catch(() => setReminders([]));
    }
  }, [view]);

  /** Adds or removes a habit from the quiet-hours alarm exemption list. */
  const toggleExemptHabit = (habitId: string, s: NotificationSettings) => {
    const nextIds = s.exemptHabitIds.includes(habitId)
      ? s.exemptHabitIds.filter((id) => id !== habitId)
      : [...s.exemptHabitIds, habitId];
    void updateNotifSettings({ ...s, exemptHabitIds: nextIds });
  };

  // ── Penalty (game) settings state ──
  const [penaltySettings, setPenaltySettings] = useState<PenaltySettings | null>(null);

  useEffect(() => {
    if (view === 'game') {
      loadPenaltySettings().then(setPenaltySettings);
    }
  }, [view]);

  // ── Penalty preview (live math for the Game view) ──
  const [penPreview, setPenPreview] = useState<{ hp: number; fine: number } | null>(null);
  useEffect(() => {
    if (view !== 'game' || !penaltySettings) return;
    let active = true;
    Promise.all([fineMult(), hpDamageMult()]).then(([fine, hp]) => {
      if (!active) return;
      const preset = PENALTY_PRESETS[penaltySettings.intensity];
      setPenPreview({ hp: Math.round(preset.hpDamage * hp), fine: Math.round(preset.fine * fine) });
    });
    return () => { active = false; };
  }, [view, penaltySettings]);

  // ── Sound Lab ── (built-in sounds preview, no configuration)

  useEffect(() => {
    loadNotificationSettings().then(setNotifSettings);
  }, [view]);

  const refreshNotifPerms = useCallback(async () => {
    try {
      const p = await Notifications.getPermissionsAsync();
      setNotifPerms({ granted: !!p.granted, canAskAgain: p.canAskAgain !== false });
    } catch {
      setNotifPerms(null);
    }
  }, []);

  useEffect(() => {
    if (view === 'notifications') {
      refreshNotifPerms();
    }
  }, [view, refreshNotifPerms]);

  /**
   * Saves new settings and resyncs the whole schedule engine so pending
   * notifications immediately pick up the changed styles/quiet hours.
   */
  const updateNotifSettings = useCallback(async (next: NotificationSettings) => {
    setNotifSettings(next);
    await saveNotificationSettings(next);
    try {
      await rebuildAllSchedules();
    } catch {}
  }, []);

  const handleNotifTimeChange = (_event: DateTimePickerEvent, d?: Date) => {
    if (!notifTimeField) return;
    setNotifTimeField(Platform.OS === 'ios' ? notifTimeField : null);
    if (!d || !notifSettings) return;
    setNotifTimeValue(d);
    const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (notifTimeField === 'digest') {
      updateNotifSettings({ ...notifSettings, digestTime: t });
    } else if (notifTimeField === 'guard') {
      updateNotifSettings({ ...notifSettings, streakGuardTime: t });
    } else if (notifTimeField === 'brief') {
      updateNotifSettings({ ...notifSettings, morningBriefTime: t });
    } else if (notifTimeField === 'nudge') {
      updateNotifSettings({ ...notifSettings, middayNudgeTime: t });
    } else if (notifTimeField === 'recap') {
      updateNotifSettings({ ...notifSettings, weeklyRecapTime: t });
    } else if (notifTimeField === 'comeback') {
      updateNotifSettings({ ...notifSettings, comebackNudgeTime: t });
    } else if (notifTimeField === 'qhStart') {
      updateNotifSettings({ ...notifSettings, quietHours: { ...notifSettings.quietHours, start: t } });
    } else if (notifTimeField === 'qhEnd') {
      updateNotifSettings({ ...notifSettings, quietHours: { ...notifSettings.quietHours, end: t } });
    }
  };

  const openNotifTimeField = (field: NotifTimeField, current: string) => {
    const [h, m] = current.split(':').map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    setNotifTimeValue(d);
    setNotifTimeField(field);
  };

  const handleEnableNotifications = async () => {
    try {
      const req = await Notifications.requestPermissionsAsync();
      setNotifPerms({ granted: !!req.granted, canAskAgain: req.canAskAgain !== false });
      if (req.granted) {
        await rebuildAllSchedules();
      }
    } catch {}
  };

  const handleTestNotification = async () => {
    // Fresh permission check on every tap — the old code re-read the state
    // captured BEFORE the await, so a just-granted permission was never seen
    // and the test silently failed to appear.
    let granted = notifPerms?.granted ?? false;
    let canAskAgain = notifPerms?.canAskAgain ?? true;
    if (!granted) {
      try {
        const req = await Notifications.requestPermissionsAsync();
        granted = !!req.granted;
        canAskAgain = req.canAskAgain !== false;
        setNotifPerms({ granted, canAskAgain });
        if (granted) {
          await rebuildAllSchedules();
        }
      } catch {}
    }
    if (!granted && !canAskAgain) {
      infoAlert('Permission Blocked', 'Notifications are blocked — enable them from the system settings first.');
      return;
    }
    await scheduleTestNotification(notifSettings ?? undefined);
    infoAlert('Test Scheduled', 'A test notification will appear in ~3 seconds.');
  };

  // ── Scheduled Notifications panel (in-app control) ──
  const [showScheduled, setShowScheduled] = useState(false);
  const [scheduledList, setScheduledList] = useState<ScheduledNotificationOverview[]>([]);

  const reloadScheduled = useCallback(async () => {
    try {
      setScheduledList(await getScheduledNotificationsOverview());
    } catch {
      setScheduledList([]);
    }
  }, []);

  const handleOpenScheduled = useCallback(async () => {
    await reloadScheduled();
    setShowScheduled(true);
  }, [reloadScheduled]);

  const handleCancelOne = useCallback(async (id: string) => {
    try {
      await cancelScheduledById(id);
    } catch {}
    await reloadScheduled();
  }, [reloadScheduled]);

  const handleCancelAllScheduled = useCallback(async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {}
    await reloadScheduled();
  }, [reloadScheduled]);

  const openAdd = () => {
    setEditingCat(null);
    setFormName('');
    setFormColor(DEFAULT_COLORS[0]);
    setFormIcon('');
    setShowForm(true);
  };

  const openEdit = (cat: CategoryDef) => {
    setEditingCat(cat);
    setFormName(cat.name);
    setFormColor(cat.color);
    setFormIcon(cat.icon ?? '');
    setShowForm(true);
    setShowActionsFor(null);
  };

  const handleDelete = (cat: CategoryDef) => {
    setShowActionsFor(null);
    confirmAlert('Delete Category', 'Delete "' + cat.name + '"? Habits using this category will be unaffected.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(cat.id) },
    ]);
  };

  const handleSave = () => {
    if (!formName.trim()) {
      infoAlert('Missing Name', 'Please enter a category name.');
      return;
    }
    if (editingCat) {
      updateCategory({ ...editingCat, name: formName.trim(), color: formColor, icon: formIcon || undefined });
    } else {
      addCategory({
        id: 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        name: formName.trim(),
        color: formColor,
        icon: formIcon || undefined,
      });
    }
    setShowForm(false);
  };

  // ── Backup & Restore handlers ──
  const [backupBusy, setBackupBusy] = useState<'' | 'export' | 'restore'>('');

  const handleExportBackup = async () => {
    setBackupBusy('export');
    try {
      await exportBackup();
      infoAlert(
        'Backup Ready',
        'All app data was exported. Save the file somewhere safe (Files, Google Drive, etc.) — you can restore it anytime.'
      );
    } catch {
      infoAlert('Backup Failed', 'Could not create the backup file. Try again.');
    } finally {
      setBackupBusy('');
    }
  };

  const handleRestoreBackup = () => {
    confirmAlert(
      'Restore Backup',
      'Restoring will overwrite current app data with the backup file contents. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBackupBusy('restore');
              try {
                const backup: BackupFile | null = await pickBackupFile();
                if (!backup) return;
                const count = await restoreFromBackup(backup);
                const when = backup.createdAt
                  ? new Date(backup.createdAt).toLocaleString()
                  : 'unknown date';
                infoAlert(
                  'Restore Complete',
                  `${count} data items restored${backup.createdAt ? ` (backup from ${when})` : ''}. Restart the app to see everything back in place.`
                );
              } catch (e) {
                infoAlert('Restore Failed', e instanceof Error ? e.message : 'Could not restore this file.');
              } finally {
                setBackupBusy('');
              }
            })();
          },
        },
      ]
    );
  };

  // ── Menu View ──
  if (view === 'menu') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <View style={styles.menuList}>
          <Pressable style={styles.menuRow} onPress={() => setView('sound')}>
            <View style={styles.menuIcon}>
              <MaterialIcons name="graphic-eq" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>Sound Lab</Text>
              <Text style={styles.menuDesc}>Built-in sounds for every app event</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => setView('notifications')}>
            <View style={[styles.menuIcon, { backgroundColor: Colors.primary }]}>
              <MaterialIcons name="notifications" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>Notifications</Text>
              <Text style={styles.menuDesc}>Alarms, digest, quiet hours & more</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => setView('game')}>
            <View style={[styles.menuIcon, { backgroundColor: '#F59E0B' }]}>
              <MaterialIcons name="sports-esports" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>Game & Penalties</Text>
              <Text style={styles.menuDesc}>HP damage, coin fines & close time</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => setView('backup')}>
            <View style={[styles.menuIcon, { backgroundColor: '#10B981' }]}>
              <MaterialIcons name="backup" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>Backup &amp; Restore</Text>
              <Text style={styles.menuDesc}>Export all app data or restore from a file</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => setView('categories')}>
            <View style={[styles.menuIcon, { backgroundColor: Colors.primary }]}>
              <MaterialIcons name="category" size={22} color="#fff" />
            </View>
            <View style={styles.menuInfo}>
              <Text style={styles.menuLabel}>Categories</Text>
              <Text style={styles.menuDesc}>Manage habit categories</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Sound Lab View ──
  if (view === 'sound') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setView('menu')} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Sound Lab</Text>
        </View>

        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.soundSectionDesc}>
            Every app function has its own built-in sound — tap play to hear it
          </Text>

          {getSfxCatalog().map((sfx) => (
            <View key={sfx.id} style={styles.sfxRow}>
              <Pressable
                style={styles.previewBtn}
                onPress={() => { void previewSound(sfx.id); }}
                hitSlop={8}
              >
                <MaterialIcons name="play-arrow" size={24} color={Colors.primary} />
              </Pressable>
              <View style={styles.sfxInfo}>
                <Text style={styles.soundLabel}>{sfx.label}</Text>
                <Text style={styles.soundDesc}>{sfx.desc}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }



  // ── Backup & Restore View ──
  if (view === 'backup') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setView('menu')} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Backup &amp; Restore</Text>
        </View>

        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.soundSectionDesc}>
            Everything in the app — habits, XP, coins, streaks, categories, settings &amp;
            history — is packed into one file you can keep anywhere.
          </Text>

          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>BACKUP</Text>
          </View>
          <Pressable
            style={[styles.modeCard, styles.modeCardSelected]}
            disabled={backupBusy !== ''}
            onPress={handleExportBackup}
          >
            <View style={styles.modeInfo}>
              <Text style={[styles.modeTitle, styles.modeTitleSelected]}>Extract App Data</Text>
              <Text style={styles.soundDesc}>
                Save a full backup file to your phone or share it to Drive, WhatsApp &amp; more
              </Text>
            </View>
            {backupBusy === 'export' ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <MaterialIcons name="file-download" size={22} color={Colors.success} />
            )}
          </Pressable>

          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>RESTORE</Text>
          </View>
          <Pressable
            style={[styles.modeCard, styles.modeCardSelected]}
            disabled={backupBusy !== ''}
            onPress={handleRestoreBackup}
          >
            <View style={styles.modeInfo}>
              <Text style={[styles.modeTitle, styles.modeTitleSelected]}>Upload Backup File</Text>
              <Text style={styles.soundDesc}>
                Pick a backup file — all your data comes back exactly where you left off
              </Text>
            </View>
            {backupBusy === 'restore' ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <MaterialIcons name="file-upload" size={22} color={Colors.warning} />
            )}
          </Pressable>

          <Text style={styles.themeHint}>
            Tip: make a fresh backup before reinstalling or switching phones — then restore
            the same file on the new install and everything returns.
          </Text>
        </ScrollView>
      </View>
    );
  }

  // ── Game & Penalties View ──
  if (view === 'game' && penaltySettings) {
    const p = penaltySettings;

    // Plain async handler (NOT a hook — this view block returns early, so
    // conditional hook calls would break the Rules of Hooks).
    const updatePenaltySettings = async (next: PenaltySettings) => {
      setPenaltySettings(next);
      await savePenaltySettings(next);
      // Rule changes feed the notification engine.
      try {
        await rebuildAllSchedules();
      } catch {}
    };

    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setView('menu')} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Game & Penalties</Text>
        </View>

        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Level difficulty — the GROWTH knob (difficultyService cache). */}
          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>LEVEL DIFFICULTY</Text>
          </View>
          <Text style={styles.soundSectionDesc}>
            How hard the climb is: XP curve &amp; payouts — mighty XP need, lean XP/coin income
          </Text>

          {(Object.keys(DIFFICULTY_PRESETS) as GameDifficulty[]).map((key) => {
            const info = DIFFICULTY_PRESETS[key];
            const sel = p.difficulty === key;
            return (
              <Pressable
                key={key}
                style={[styles.modeCard, sel && styles.modeCardSelected]}
                onPress={() => {
                  void (async () => {
                    await applyDifficulty(key);
                    const next = { ...p, difficulty: key };
                    setPenaltySettings(next);
                    await savePenaltySettings(next);
                  })();
                }}
              >
                <View style={styles.modeInfo}>
                  <Text style={[styles.modeTitle, sel && styles.modeTitleSelected]}>{info.label}</Text>
                  <Text style={styles.soundDesc}>{info.desc}</Text>
                </View>
                <MaterialIcons
                  name={sel ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={20}
                  color={sel ? Colors.primary : Colors.textSecondary}
                />
              </Pressable>
            );
          })}

          {/* Intensity preset */}
          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>PENALTY INTENSITY</Text>
          </View>
          <Text style={styles.soundSectionDesc}>
            How hard missed habits hit: HP damage &amp; coin fines
          </Text>

          {(Object.keys(PENALTY_PRESETS) as (keyof typeof PENALTY_PRESETS)[]).map((key) => {
            const info = PENALTY_PRESETS[key];
            const sel = p.intensity === key;
            return (
              <Pressable
                key={key}
                style={[styles.modeCard, sel && styles.modeCardSelected]}
                onPress={() => { void updatePenaltySettings({ ...p, intensity: key }); }}
              >
                <View style={styles.modeInfo}>
                  <Text style={[styles.modeTitle, sel && styles.modeTitleSelected]}>{info.label}</Text>
                  <Text style={styles.soundDesc}>{info.desc}</Text>
                </View>
                <MaterialIcons
                  name={sel ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={20}
                  color={sel ? Colors.primary : Colors.textSecondary}
                />
              </Pressable>
            );
          })}

          {/* Live penalty preview — transparent math, no ugly surprises */}
          {penPreview && (
            <View style={[styles.modeCard, styles.modeCardSelected]}>
              <View style={styles.modeInfo}>
                <Text style={[styles.modeTitle, styles.modeTitleSelected]}>
                  Miss 2 scheduled habits &rarr; −{penPreview.hp * 2} HP, −{penPreview.fine * 2} coins
                </Text>
                <Text style={styles.soundDesc}>
                  Per-miss math, before shields, freezes &amp; rough-mood mercy. Insurance halves HP.
                </Text>
              </View>
              <MaterialIcons name="calculate" size={22} color={Colors.warning} />
            </View>
          )}

          {/* Day rollover — automatic, no manual close */}
          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>DAY ROLLOVER</Text>
          </View>
          <Text style={styles.soundSectionDesc}>
            Days close automatically at midnight &mdash; missed habits are settled in the next-day sweep, no button to press
          </Text>
          <View style={styles.modeCard}>
            <View style={styles.modeInfo}>
              <Text style={[styles.modeTitle, styles.modeTitleSelected]}>Automatic day close</Text>
              <Text style={styles.soundDesc}>
                When a new day starts, the previous day closes itself. Shields, freezes, insurance and rough-mood mercy apply exactly the same way.
              </Text>
            </View>
            <MaterialIcons name="autorenew" size={22} color={Colors.success} />
          </View>

          <View style={styles.apiBtnRow}>
            <Pressable
              style={[styles.apiBtn, styles.apiBtnPrimary]}
              onPress={() => { void updatePenaltySettings(p); infoAlert('Saved', 'Game rules updated. Streak warnings rescheduled.'); }}
            >
              <MaterialIcons name="save" size={18} color="#fff" />
              <Text style={styles.apiBtnText}>Save Game Rules</Text>
            </Pressable>
          </View>

          <Text style={styles.themeHint}>
            Tip: rough-mood days halve fines automatically &mdash; and shields, freezes and
            insurance always soak penalties before HP.
          </Text>
        </ScrollView>

      </View>
    );
  }

  if (view === 'game' && !penaltySettings) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // ── Notifications View ──
  if (view === 'notifications' && notifSettings) {
    const s = notifSettings;
    const permGranted = notifPerms?.granted ?? false;

    // Reminder Coverage — habits that would silently slip through because
    // they have no enabled reminder to fire them.
    const activeHabits = habits.filter((h) => !h.archived);
    const protectedIds = new Set(
      reminders.filter((r) => r.enabled !== false).map((r) => r.habitId)
    );
    const unprotected = activeHabits.filter((h) => !protectedIds.has(h.id));
    const coverageFull = activeHabits.length > 0 && unprotected.length === 0;

    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => setView('menu')} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>

        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── STATUS ── */}
          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>STATUS</Text>
          </View>
          <Text style={styles.soundSectionDesc}>Check this first if reminders ever stop arriving</Text>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>System Permission</Text>
              <Text style={styles.soundDesc}>
                {permGranted
                  ? 'Notifications are allowed on this device'
                  : notifPerms?.canAskAgain === false
                    ? 'Blocked — enable in system settings'
                    : 'Needed before reminders can fire'}
              </Text>
            </View>
            {permGranted ? (
              <View style={[styles.permPill, { backgroundColor: `${Colors.success}18` }]}>
                <Text style={[styles.permPillText, { color: Colors.success }]}>On</Text>
              </View>
            ) : notifPerms?.canAskAgain === false ? (
              <Pressable style={styles.notifActionBtn} onPress={() => Linking.openSettings()}>
                <Text style={styles.notifActionText}>Settings</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.notifActionBtn} onPress={handleEnableNotifications}>
                <Text style={styles.notifActionText}>Enable</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>All Notifications</Text>
              <Text style={styles.soundDesc}>Master switch — mutes every reminder instantly</Text>
            </View>
            <Switch
              value={s.masterEnabled}
              onValueChange={(val) => updateNotifSettings({ ...s, masterEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {!s.masterEnabled && (
            <View style={[styles.coverCard, styles.coverCardWarn]}>
              <View style={styles.coverHeader}>
                <MaterialIcons name="warning" size={22} color={Colors.warning} />
                <Text style={styles.soundLabel}>Notifications are OFF</Text>
              </View>
              <Text style={styles.coverCount}>
                Nothing will fire — no alarms, nudges or smart alerts — until the master switch is back on.
              </Text>
            </View>
          )}

          <Pressable style={styles.scheduledCard} onPress={() => { void handleOpenScheduled(); }}>
            <MaterialIcons name="schedule" size={22} color={Colors.primary} />
            <View style={styles.scheduledInfo}>
              <Text style={styles.soundLabel}>Scheduled Notifications</Text>
              <Text style={styles.soundDesc}>See everything pending — cancel any item</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Colors.textMuted} />
          </Pressable>

          {/* ── NEVER MISS PROTECTION ── */}
          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>NEVER MISS PROTECTION</Text>
          </View>
          <Text style={styles.soundSectionDesc}>
            Layers of safety so no habit slips through the cracks
          </Text>

          {/* Reminder Coverage */}
          <View style={[styles.coverCard, !coverageFull && styles.coverCardWarn]}>
            <View style={styles.coverHeader}>
              <MaterialIcons
                name={coverageFull ? 'verified' : 'warning'}
                size={22}
                color={coverageFull ? Colors.success : Colors.warning}
              />
              <Text style={styles.soundLabel}>Reminder Coverage</Text>
            </View>
            <Text style={styles.coverCount}>
              {activeHabits.length === 0
                ? 'No habits yet — add reminders when you create one'
                : coverageFull
                  ? 'All habits have reminders set'
                  : `${activeHabits.length - unprotected.length} of ${activeHabits.length} habits protected — ${unprotected.length} without reminders`}
            </Text>
            {unprotected.length > 0 && (
              <>
                <View style={styles.coverBadges}>
                  {unprotected.map((h) => (
                    <View key={h.id} style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText} numberOfLines={1}>{h.name}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.soundDesc}>
                  Open the Habits Manager and add a reminder to these — they can&apos;t alert you without one.
                </Text>
              </>
            )}
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Morning Brief</Text>
              <Text style={styles.soundDesc}>Start the day knowing today&apos;s plan</Text>
              <Pressable
                style={styles.notifTimeBtn}
                onPress={() => { openNotifTimeField('brief', s.morningBriefTime); }}
              >
                <MaterialIcons name="access-time" size={16} color={Colors.primary} />
                <Text style={styles.notifTimeText}>{s.morningBriefTime}</Text>
              </Pressable>
            </View>
            <Switch
              value={s.morningBriefEnabled}
              onValueChange={(val) => updateNotifSettings({ ...s, morningBriefEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Mid-day Nudge</Text>
              <Text style={styles.soundDesc}>Afternoon progress push to keep pace</Text>
              <Pressable
                style={styles.notifTimeBtn}
                onPress={() => { openNotifTimeField('nudge', s.middayNudgeTime); }}
              >
                <MaterialIcons name="access-time" size={16} color={Colors.primary} />
                <Text style={styles.notifTimeText}>{s.middayNudgeTime}</Text>
              </Pressable>
            </View>
            <Switch
              value={s.middayNudgeEnabled}
              onValueChange={(val) => updateNotifSettings({ ...s, middayNudgeEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Streak Guard</Text>
              <Text style={styles.soundDesc}>Warns you before the day&apos;s habits expire</Text>
              <Pressable
                style={styles.notifTimeBtn}
                onPress={() => { openNotifTimeField('guard', s.streakGuardTime); }}
              >
                <MaterialIcons name="access-time" size={16} color={Colors.primary} />
                <Text style={styles.notifTimeText}>{s.streakGuardTime}</Text>
              </Pressable>
            </View>
            <Switch
              value={s.streakGuardEnabled}
              onValueChange={(val) => updateNotifSettings({ ...s, streakGuardEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Day-Close Warning</Text>
              <Text style={styles.soundDesc}>
                60-min warning before the day closes &amp; penalties hit (needs the close-time
                switch in Game &amp; Penalties)
              </Text>
            </View>
            <Switch
              value={s.dayCloseWarnEnabled !== false}
              onValueChange={(val) => updateNotifSettings({ ...s, dayCloseWarnEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Daily Digest</Text>
              <Text style={styles.soundDesc}>Evening summary of today&apos;s habits</Text>
              <Pressable
                style={styles.notifTimeBtn}
                onPress={() => { openNotifTimeField('digest', s.digestTime); }}
              >
                <MaterialIcons name="access-time" size={16} color={Colors.primary} />
                <Text style={styles.notifTimeText}>{s.digestTime}</Text>
              </Pressable>
            </View>
            <Switch
              value={s.digestEnabled}
              onValueChange={(val) => updateNotifSettings({ ...s, digestEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Comeback Nudge</Text>
              <Text style={styles.soundDesc}>Fire after a fully-missed day</Text>
              <Pressable
                style={styles.notifTimeBtn}
                onPress={() => { openNotifTimeField('comeback', s.comebackNudgeTime); }}
              >
                <MaterialIcons name="access-time" size={16} color={Colors.primary} />
                <Text style={styles.notifTimeText}>{s.comebackNudgeTime}</Text>
              </Pressable>
            </View>
            <Switch
              value={s.comebackNudgeEnabled}
              onValueChange={(val) => updateNotifSettings({ ...s, comebackNudgeEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Weekly Recap</Text>
              <Text style={styles.soundDesc}>End-of-week wins &amp; stats summary</Text>
              <View style={styles.chipRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, idx) => {
                  const sel = s.weeklyRecapDay === idx;
                  return (
                    <Pressable
                      key={dayName}
                      style={[styles.dayChip, sel && styles.chipBtnSelected]}
                      onPress={() => { updateNotifSettings({ ...s, weeklyRecapDay: idx }); }}
                    >
                      <Text style={[styles.dayChipText, sel && styles.chipTextSelected]}>
                        {dayName.slice(0, 2)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                style={styles.notifTimeBtn}
                onPress={() => { openNotifTimeField('recap', s.weeklyRecapTime); }}
              >
                <MaterialIcons name="access-time" size={16} color={Colors.primary} />
                <Text style={styles.notifTimeText}>{s.weeklyRecapTime}</Text>
              </Pressable>
            </View>
            <Switch
              value={s.weeklyRecapEnabled}
              onValueChange={(val) => updateNotifSettings({ ...s, weeklyRecapEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* ── REMINDER DEFAULTS ── */}
          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>REMINDER DEFAULTS</Text>
          </View>
          <Text style={styles.soundSectionDesc}>Applied when adding a new reminder</Text>

          <Text style={styles.inlineLabel}>Style</Text>
          <View style={styles.chipRow}>
            {([['alarm', 'Alarm', 'alarm'], ['remind', 'Nudge', 'notifications-active']] as const).map(
              ([value, label, icon]) => {
                const sel = s.defaultType === value;
                return (
                  <Pressable
                    key={value}
                    style={[styles.chipBtn, sel && styles.chipBtnSelected]}
                    onPress={() => updateNotifSettings({ ...s, defaultType: value })}
                  >
                    <MaterialIcons name={icon} size={16} color={sel ? '#fff' : Colors.textSecondary} />
                    <Text style={[styles.chipText, sel && styles.chipTextSelected]}>{label}</Text>
                  </Pressable>
                );
              }
            )}
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Sound</Text>
              <Text style={styles.soundDesc}>Play a sound on new reminders</Text>
            </View>
            <Switch
              value={s.defaultSound}
              onValueChange={(val) => updateNotifSettings({ ...s, defaultSound: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* ── CELEBRATIONS ── */}
          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>CELEBRATIONS</Text>
          </View>
          <Text style={styles.soundSectionDesc}>
            Motivational pops when you hit new highs
          </Text>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Streak Milestones</Text>
              <Text style={styles.soundDesc}>Push on day 7, 14, 30, 50, 100…</Text>
            </View>
            <Switch
              value={s.milestonesEnabled}
              onValueChange={(val) => updateNotifSettings({ ...s, milestonesEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Perfect Day</Text>
              <Text style={styles.soundDesc}>Push when all today&apos;s habits are done</Text>
            </View>
            <Switch
              value={s.perfectDayEnabled}
              onValueChange={(val) => updateNotifSettings({ ...s, perfectDayEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>App Icon Badge</Text>
              <Text style={styles.soundDesc}>iOS: pending habits count on the app icon</Text>
            </View>
            <Switch
              value={s.appBadgeEnabled}
              onValueChange={(val) => updateNotifSettings({ ...s, appBadgeEnabled: val })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* ── QUIET HOURS ── */}
          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>QUIET HOURS</Text>
          </View>
          <Text style={styles.soundSectionDesc}>
            Reminders stay visible but silent in this window
          </Text>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Enabled</Text>
              <Text style={styles.soundDesc}>Like do-not-disturb for this app</Text>
            </View>
            <Switch
              value={s.quietHours.enabled}
              onValueChange={(val) => updateNotifSettings({ ...s, quietHours: { ...s.quietHours, enabled: val } })}
              trackColor={{ false: Colors.chipBg, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {s.quietHours.enabled && (
            <>
              <View style={styles.soundRow}>
                <View style={styles.soundInfo}>
                  <Text style={styles.soundLabel}>From</Text>
                  <Pressable
                    style={styles.notifTimeBtn}
                    onPress={() => { openNotifTimeField('qhStart', s.quietHours.start); }}
                  >
                    <MaterialIcons name="access-time" size={16} color={Colors.primary} />
                    <Text style={styles.notifTimeText}>{s.quietHours.start}</Text>
                  </Pressable>
                </View>
                <View style={styles.soundInfo}>
                  <Text style={styles.soundLabel}>Until</Text>
                  <Pressable
                    style={styles.notifTimeBtn}
                    onPress={() => { openNotifTimeField('qhEnd', s.quietHours.end); }}
                  >
                    <MaterialIcons name="access-time" size={16} color={Colors.primary} />
                    <Text style={styles.notifTimeText}>{s.quietHours.end}</Text>
                  </Pressable>
                </View>
              </View>

              {activeHabits.length > 0 && (
                <View style={styles.soundRow}>
                  <View style={[styles.soundInfo, { gap: Spacing.sm }]}>
                    <Text style={styles.soundLabel}>Always-Loud Habits</Text>
                    <Text style={styles.soundDesc}>
                      Selected habits break silence and ring even during quiet hours
                    </Text>
                    <View style={styles.exemptRow}>
                      {activeHabits.map((h) => {
                        const on = s.exemptHabitIds.includes(h.id);
                        return (
                          <Pressable
                            key={h.id}
                            style={[styles.exemptChip, on && styles.exemptChipOn]}
                            onPress={() => { toggleExemptHabit(h.id, s); }}
                          >
                            <Text style={[styles.exemptChipText, on && styles.exemptChipTextOn]} numberOfLines={1}>
                              {h.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}
            </>
          )}

          {/* ── TROUBLESHOOTING ── */}
          <View style={styles.soundSectionLabel}>
            <Text style={styles.sectionLabelText}>TROUBLESHOOTING</Text>
          </View>
          <Text style={styles.soundSectionDesc}>
            Reminders arriving late or not at all?
          </Text>

          <View style={styles.soundRow}>
            <View style={styles.soundInfo}>
              <Text style={styles.soundLabel}>Device Notification Settings</Text>
              <Text style={styles.soundDesc}>
                Check permissions, allow alarms &amp; reminders, and disable battery
                optimization for this app
              </Text>
            </View>
            <Pressable style={styles.notifActionBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.notifActionText}>Open</Text>
            </Pressable>
          </View>

          {/* Test */}
          <View style={styles.apiBtnRow}>
            <Pressable style={[styles.apiBtn, styles.apiBtnPrimary]} onPress={handleTestNotification}>
              <MaterialIcons name="notifications-active" size={18} color="#fff" />
              <Text style={styles.apiBtnText}>Test in 3s</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* Scheduled notifications sheet */}
        <Modal visible={showScheduled} transparent animationType="slide" onRequestClose={() => setShowScheduled(false)}>
          <Pressable style={styles.sheetOverlay} onPress={() => setShowScheduled(false)}>
            <Pressable
              style={[styles.sheetPanel, { paddingBottom: Math.max(insets.bottom + Spacing.md, Spacing.xl) }]}
              onPress={() => {}}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Scheduled Notifications</Text>
                <Pressable onPress={() => setShowScheduled(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent}>
                {scheduledList.length === 0 ? (
                  <View style={styles.schedEmpty}>
                    <MaterialIcons name="notifications" size={30} color={Colors.textMuted} />
                    <Text style={styles.schedEmptyTitle}>Nothing scheduled right now</Text>
                    <Text style={styles.schedEmptyHint}>Reminders &amp; smart alerts will appear here</Text>
                  </View>
                ) : (
                  scheduledList.map((item) => {
                    const badgeStyle =
                      item.kind === 'reminder' ? styles.schedBadgeReminder
                        : item.kind === 'snooze' ? styles.schedBadgeSnooze
                          : item.kind === 'smart' ? styles.schedBadgeSmart
                            : item.kind === 'celebration' ? styles.schedBadgeCelebrate
                              : styles.schedBadgeOther;
                    const label = KIND_LABELS[item.kind];
                    return (
                      <View key={item.id} style={styles.schedRow}>
                        <View style={[styles.schedBadge, badgeStyle]}>
                          <Text style={[styles.schedBadgeText, item.kind === 'reminder' && styles.schedBadgeTextReminder]}>
                            {label}
                          </Text>
                        </View>
                        <View style={styles.schedMain}>
                          <Text style={styles.schedTitle} numberOfLines={1}>{item.title}</Text>
                          {!!item.body && <Text style={styles.schedBody} numberOfLines={2}>{item.body}</Text>}
                          <Text style={styles.schedWhen}>{item.repeatSummary}</Text>
                        </View>
                        <Pressable onPress={() => { void handleCancelOne(item.id); }} hitSlop={8}>
                          <MaterialIcons name="cancel" size={24} color={Colors.danger} />
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              {scheduledList.length > 0 && (
                <Pressable
                  style={styles.schedCancelAll}
                  onPress={() => { void handleCancelAllScheduled(); }}
                >
                  <MaterialIcons name="clear-all" size={18} color={Colors.danger} />
                  <Text style={styles.schedCancelAllText}>Cancel All</Text>
                </Pressable>
              )}
              <Text style={styles.sheetHint}>Reminders auto-restore on next app launch</Text>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Time pickers */}
        {notifTimeField && (
          <DateTimePicker
            value={notifTimeValue}
            mode="time"
            display="spinner"
            onChange={handleNotifTimeChange}
          />
        )}
      </View>
    );
  }

  if (view === 'notifications' && !notifSettings) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // ── Categories View ──
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => setView('menu')} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Categories</Text>
        <Pressable style={styles.addBtn} onPress={openAdd}>
          <MaterialIcons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {allCats.map((cat) => (
          <View key={cat.id} style={styles.catRow}>
            <View style={[styles.catIcon, { backgroundColor: cat.color }]}>
              <CategoryIcon icon={cat.icon || 'category'} color={cat.color} size={20} />
            </View>
            <Text style={styles.catName}>{cat.name}</Text>
            <View style={[styles.catDot, { backgroundColor: cat.color }]} />
            <Pressable
              style={styles.catActionBtn}
              onPress={() => setShowActionsFor(showActionsFor === cat.id ? null : cat.id)}
              hitSlop={8}
            >
              <MaterialIcons
                name={showActionsFor === cat.id ? 'expand-less' : 'more-horiz'}
                size={20}
                color={Colors.textSecondary}
              />
            </Pressable>
            {showActionsFor === cat.id && (
              <View style={styles.actions}>
                <Pressable style={styles.actionBtn} onPress={() => openEdit(cat)}>
                  <MaterialIcons name="edit" size={18} color={Colors.primary} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                {!defaultCats.find((d) => d.id === cat.id) && (
                  <Pressable style={styles.actionBtn} onPress={() => handleDelete(cat)}>
                    <MaterialIcons name="delete" size={18} color={Colors.danger} />
                    <Text style={[styles.actionText, { color: Colors.danger }]}>Delete</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ))}
        {allCats.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No categories yet. Tap + to add one.</Text>
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Category Modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCat ? 'Edit Category' : 'New Category'}</Text>
              <Pressable onPress={() => setShowForm(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={Colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Category Name</Text>
              <TextInput
                style={styles.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Fitness, Reading..."
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={[styles.label, { marginTop: Spacing.md }]}>Color</Text>
              <View style={styles.colorGrid}>
                {DEFAULT_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.colorBox, { backgroundColor: c }, formColor === c && styles.colorSelected]}
                    onPress={() => setFormColor(c)}
                  />
                ))}
              </View>

              <View style={styles.placeholderBox}>
                <Text style={styles.placeholderText}>RGB & Opacity sliders coming soon</Text>
              </View>

              <Text style={[styles.label, { marginTop: Spacing.md }]}>Icon</Text>
              <View style={styles.iconGrid}>
                {PRESET_ICONS.map((ic) => (
                  <Pressable
                    key={ic}
                    style={[styles.iconBox, formIcon === ic && styles.iconSelected]}
                    onPress={() => setFormIcon(ic)}
                  >
                    <MaterialIcons name={ic as any} size={22} color={formIcon === ic ? '#fff' : Colors.textSecondary} />
                  </Pressable>
                ))}
                {SVG_ICON_NAMES.map((ic) => (
                  <Pressable
                    key={ic}
                    style={[styles.iconBox, formIcon === ic && styles.iconSelected]}
                    onPress={() => setFormIcon(ic)}
                  >
                    <View style={{ width: 22, height: 22, justifyContent: 'center', alignItems: 'center' }}>
                      <CategoryIcon icon={ic} color={formIcon === ic ? '#fff' : Colors.textSecondary} size={20} />
                    </View>
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>{editingCat ? 'Update' : 'Save'}</Text>
              </Pressable>
            </ScrollView>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
    gap: Spacing.md,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  menuList: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuInfo: {
    flex: 1,
    gap: 4,
  },
  menuLabel: {
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  menuDesc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  catIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catName: {
    flex: 1,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  catDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  catActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    marginTop: Spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  actionText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  empty: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
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
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    maxHeight: '85%',
    borderTopWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.sm,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  colorBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: '#fff',
    borderWidth: 3,
  },
  placeholderBox: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  iconSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  soundInfo: {
    flex: 1,
    gap: 4,
  },
  soundLabel: {
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  soundDesc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  soundSectionLabel: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  sectionLabelText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.4,
  },
  soundSectionDesc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  previewBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  chipBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 6,
  },
  chipBtnSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  dayChip: {
    flexBasis: '25%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  dayChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  permPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  permPillText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  notifActionBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  notifActionText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  notifTimeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
  notifTimeText: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  scheduledCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  scheduledInfo: {
    flex: 1,
  },
  coverCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  coverCardWarn: {
    borderColor: 'rgba(251,191,36,0.45)',
  },
  coverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  coverCount: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
    lineHeight: 20,
  },
  coverBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  coverBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    maxWidth: 160,
  },
  coverBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.warning,
  },
  exemptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  exemptChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    maxWidth: 160,
  },
  exemptChipOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  exemptChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  exemptChipTextOn: {
    color: '#fff',
    fontWeight: FontWeight.semibold,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingBottom: Spacing.sm,
  },
  schedRow: {
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
  schedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: Colors.chipBg,
  },
  schedBadgeReminder: {
    backgroundColor: Colors.primaryGlow,
  },
  schedBadgeSnooze: {
    backgroundColor: 'rgba(126,126,135,0.18)',
  },
  schedBadgeSmart: {
    backgroundColor: 'rgba(52,211,153,0.14)',
  },
  schedBadgeCelebrate: {
    backgroundColor: 'rgba(251,191,36,0.14)',
  },
  schedBadgeOther: {
    backgroundColor: Colors.chipBg,
  },
  schedBadgeText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
  },
  schedBadgeTextReminder: {
    color: Colors.primary,
  },
  schedMain: {
    flex: 1,
  },
  schedTitle: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  schedBody: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  schedWhen: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 3,
  },
  schedEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.xs,
  },
  schedEmptyTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  schedEmptyHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  schedCancelAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: Radius.md,
    paddingVertical: 12,
    marginTop: Spacing.sm,
  },
  schedCancelAllText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.danger,
  },
  sheetHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  sfxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
  },
  sfxInfo: {
    flex: 1,
    gap: 4,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  modeCardSelected: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  modePreview: {
    width: 54,
    height: 66,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    paddingTop: 10,
    gap: 5,
  },
  modePreviewDot: {
    width: 14,
    height: 14,
    borderRadius: Radius.full,
  },
  modePreviewLine: {
    width: 32,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.35)',
  },
  modePreviewLineShort: {
    width: 20,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.20)',
  },
  modeInfo: {
    flex: 1,
  },
  modeTitle: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
    marginBottom: 2,
  },
  modeTitleSelected: {
    color: Colors.primary,
  },
  accentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  accentDot: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentDotSelected: {
    borderWidth: 2.5,
    borderColor: Colors.textPrimary,
  },
  themeHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  apiSectionLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1.4,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  apiInput: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
  },
  apiStatusSaved: {
    fontSize: FontSize.xs,
    color: Colors.success,
    marginTop: Spacing.sm,
    marginLeft: 2,
    fontWeight: FontWeight.medium,
  },
  apiBtnRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  apiBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: Radius.md,
    gap: Spacing.sm,
  },
  apiBtnPrimary: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  apiBtnOutline: {
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  apiBtnDisabled: {
    opacity: 0.5,
  },
  apiBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  apiTestResult: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  apiTestSuccess: {
    backgroundColor: `${Colors.success}12`,
    borderWidth: 1,
    borderColor: `${Colors.success}40`,
  },
  apiTestFail: {
    backgroundColor: `${Colors.danger}12`,
    borderWidth: 1,
    borderColor: `${Colors.danger}40`,
  },
  apiTestResultText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
  apiDivider: {
    height: 0.5,
    backgroundColor: Colors.separator,
    marginVertical: Spacing.xl,
  },
  apiModelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
  },
  apiModelInfo: {
    flex: 1,
    gap: 4,
  },
  apiModelLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  apiModelValue: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  apiModelCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: Spacing.sm,
  },
  modelPickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    maxHeight: '70%',
    borderTopWidth: 0.5,
    borderColor: Colors.cardBorder,
  },
  modelPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modelPickerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modelPickerEmpty: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  modelPickerEmptyText: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
  modelPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  modelPickerItemSelected: {
    backgroundColor: Colors.primaryGlow,
  },
  modelPickerItemInfo: {
    flex: 1,
    gap: 3,
  },
  modelPickerItemName: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  modelPickerItemId: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: 'monospace',
  },
  modelPickerFreeBadge: {
    backgroundColor: `${Colors.success}18`,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  modelPickerFreeText: {
    fontSize: FontSize.xs,
    color: Colors.success,
    fontWeight: FontWeight.semibold,
  },
  activeProviderSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  activeProviderRow: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  activeProviderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: Spacing.md,
  },
  activeProviderBtnSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  activeProviderLabel: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  activeProviderBadge: {
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  activeProviderBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepDotDone: {
    backgroundColor: Colors.success,
  },
  stepDotPending: {
    backgroundColor: Colors.textMuted,
  },
  stepLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  stepLabelDone: {
    color: Colors.success,
    fontWeight: FontWeight.semibold,
  },
  stepLine: {
    width: 32,
    height: 2,
    backgroundColor: Colors.cardBorder,
    borderRadius: 1,
  },
  modelPickerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    marginTop: Spacing.lg,
  },
});
