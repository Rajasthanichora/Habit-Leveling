// Powered by OnSpace.AI
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  Habit,
  NotificationSettings,
  QuietHoursConfig,
  ReminderConfig,
  ReminderRepeatMode,
} from './types';
import { formatDate, isHabitActiveOnDate, parseDate, todayStr } from './recurrenceService';
import { computeHabitStreak, loadFreezeStore } from './streakService';

// ─── Constants ───────────────────────────────────────────────────────────────

// Numeric mirrors of expo-notifications' AndroidImportance /
// AndroidNotificationVisibility enums (they follow Android platform values;
// numeric literals keep the lint resolver happy across SDK versions).
const IMPORTANCE = { LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 } as const;
const VISIBILITY_PUBLIC = 1;

export const DEFAULT_ALARM_SOUND = 'musical_alarm.wav';

export const CATEGORY_ALARM = 'habit-alarm';
export const CATEGORY_REMIND = 'habit-remind';

export const DONE_ACTION = 'DONE_ACTION';
export const SNOOZE_ACTION = 'SNOOZE_ACTION';
export const SNOOZE_60_ACTION = 'SNOOZE_60_ACTION';

/**
 * Android channel ids. Sound channels carry the built-in alarm sound; the
 * silent variants are used during quiet hours — vibration is never used.
 */
const CH = {
  alarmSound: 'notif_alarm_sound',
  alarmSilent: 'notif_alarm_silent',
  remindSound: 'notif_remind_sound',
  remindSilent: 'notif_remind_silent',
  digest: 'notif_digest',
  brief: 'notif_brief',
  streakGuard: 'notif_streak_guard',
  rewards: 'notif_rewards',
} as const;

/** Streak lengths worth a celebration push. */
const MILESTONES = [7, 14, 30, 50, 100, 180, 365];

/** Occurrences scheduled ahead for frequency shapes a calendar trigger can't express. */
const WINDOW_SIZE = 8;
/** Overall safety cap so iOS's ~64 scheduled-notification limit is never hit. */
const MAX_SCHEDULED = 60;

const DIGEST_PREFIX = 'smart_digest_';
const GUARD_PREFIX = 'smart_guard_';
const CLOSEWARN_PREFIX = 'smart_closewarn_';
const BRIEF_PREFIX = 'smart_brief_';
const MIDDAY_PREFIX = 'smart_midday_';
const RECAP_PREFIX = 'smart_recap_';
const COMEBACK_PREFIX = 'smart_comeback_';
const CELEBRATE_PREFIX = 'celebrate_';
const SNOOZE_PREFIX = 'snooze_';

// ─── Small time helpers ──────────────────────────────────────────────────────

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** True when `time` falls inside the quiet-hours window (handles overnight wrap). */
export function isTimeInQuietWindow(time: string, qh?: QuietHoursConfig): boolean {
  if (!qh || !qh.enabled) return false;
  const v = toMinutes(time);
  const s = toMinutes(qh.start);
  const e = toMinutes(qh.end);
  return s <= e ? v >= s && v < e : v >= s || v < e;
}

function timeToParts(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(':').map(Number);
  return { hour: h || 0, minute: m || 0 };
}

// ─── Reminder identity (deterministic ids -> re-saves overwrite, not stack) ──

/** Prefix of every id that can be created for this reminder in this mode. */
function reminderIdPrefix(reminder: ReminderConfig): string {
  const mode: ReminderRepeatMode = reminder.repeat ?? 'off';
  const time = reminder.time.replace(':', '');
  return `n_${reminder.habitId}_${mode}_${time}`;
}

function reminderBaseId(reminder: ReminderConfig): string {
  return reminderIdPrefix(reminder);
}

// ─── Channels ────────────────────────────────────────────────────────────────

async function createAndroidChannel(
  id: string,
  name: string,
  importance: number,
  sound: string | null
): Promise<void> {
  try {
    // Fields span old and new expo-notifications typings; the runtime reads
    // whichever it knows and ignores the rest. Vibration is never enabled.
    const input = {
      name,
      importance,
      sound: sound ?? undefined,
      enableVibrate: false,
      vibrate: false,
      lockScreenVisibility: VISIBILITY_PUBLIC,
      showBadge: true,
    } as unknown as Notifications.NotificationChannelInput;
    await Notifications.setNotificationChannelAsync(id, input);
  } catch {}
}

async function ensureChannels(alarmSound: string): Promise<void> {
  if (Platform.OS !== 'android' || typeof Notifications.setNotificationChannelAsync !== 'function') return;

  const MAXI = IMPORTANCE.MAX;
  const DEFI = IMPORTANCE.DEFAULT;
  const HIGHI = IMPORTANCE.HIGH;
  const LOWI = IMPORTANCE.LOW;

  // Alarm family — MAX importance so alarms always break through.
  await createAndroidChannel(CH.alarmSound, 'Habit alarms (sound)', MAXI, alarmSound);
  await createAndroidChannel(CH.alarmSilent, 'Habit alarms (silent)', MAXI, null);

  // Reminder family — DEFAULT importance, user-friendly nudges.
  await createAndroidChannel(CH.remindSound, 'Habit nudges (sound)', DEFI, alarmSound);
  await createAndroidChannel(CH.remindSilent, 'Habit nudges (silent)', DEFI, null);

  // System conveniences.
  await createAndroidChannel(CH.digest, 'Daily digest', LOWI, null);
  await createAndroidChannel(CH.brief, 'Morning brief & nudges', DEFI, null);
  await createAndroidChannel(CH.streakGuard, 'Streak guard', HIGHI, null);
  await createAndroidChannel(CH.rewards, 'Rewards & milestones', DEFI, null);
}

/**
 * Channel for a reminder: derives from type + the sound flag, downgraded to
 * the silent variant when quiet hours apply (unless exempt). Never vibrates.
 */
function resolveChannel(reminder: ReminderConfig, settings: NotificationSettings): string {
  const isAlarm = reminder.type !== 'remind';
  const quiet =
    isTimeInQuietWindow(reminder.time, settings.quietHours) &&
    !settings.exemptHabitIds.includes(reminder.habitId);
  const sound = reminder.sound !== false && !quiet;

  if (isAlarm) {
    return sound ? CH.alarmSound : CH.alarmSilent;
  }
  return sound ? CH.remindSound : CH.remindSilent;
}

// ─── Init (channels + categories + handler + permissions) ────────────────────

async function ensureCategories(): Promise<void> {
  const actions: Notifications.NotificationAction[] = [
    {
      identifier: DONE_ACTION,
      buttonTitle: 'Done ✓',
      options: { opensAppToForeground: true },
    },
    {
      identifier: SNOOZE_ACTION,
      buttonTitle: 'Snooze 15m',
      options: { opensAppToForeground: true },
    },
    {
      identifier: SNOOZE_60_ACTION,
      buttonTitle: 'Snooze 1h',
      options: { opensAppToForeground: true },
    },
  ];
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_ALARM, actions);
  } catch {}
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_REMIND, actions);
  } catch {}
}

function setForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
      const audible = data.audible === true;
      return {
        // Foreground presentation was previously suppressed entirely — fix it
        // so notifications surface while the app is open too.
        shouldPlaySound: audible,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
}

/**
 * One-time boot: creates channels, registers action categories, sets the
 * foreground handler and (re)asks for permission only when it's still
 * askable — never spams the system prompt on every launch.
 */
export async function initNotifications(): Promise<void> {
  await ensureChannels(DEFAULT_ALARM_SOUND);
  await ensureCategories();
  setForegroundHandler();

  try {
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted && perms.canAskAgain !== false) {
      await Notifications.requestPermissionsAsync();
    }
    // Android 14+ denies SCHEDULE_EXACT_ALARM by default unless asked, and the
    // whole point of the alarm reminders is precision — without this grant the
    // OS degrades every alarm to best-effort (late firing, Doze drift). Ask
    // once here, same never-spam policy as the notification permission above.
    if (Platform.OS === 'android') {
      const getExact = (Notifications as Record<string, unknown>).getExactAlarmPermissionsAsync as
        | (() => Promise<{ granted: boolean; canAskAgain?: boolean }>)
        | undefined;
      const requestExact = (Notifications as Record<string, unknown>).requestExactAlarmPermissionsAsync as
        | (() => Promise<unknown>)
        | undefined;
      if (typeof getExact === 'function' && typeof requestExact === 'function') {
        const exact = await getExact();
        if (!exact.granted && exact.canAskAgain !== false) {
          await requestExact();
        }
      }
    }
  } catch {}
}

// ─── Trigger builders ────────────────────────────────────────────────────────

interface ReminderContent {
  title: string;
  body: string;
  category: string;
  /** Resolved sound for iOS; Android uses the channel instead. */
  sound: string | undefined;
  interruptionLevel: 'timeSensitive' | 'active';
  data: Record<string, unknown>;
}

function buildContent(reminder: ReminderConfig, habitName: string, settings: NotificationSettings): ReminderContent {
  const isAlarm = reminder.type !== 'remind';
  const quiet =
    isTimeInQuietWindow(reminder.time, settings.quietHours) &&
    !settings.exemptHabitIds.includes(reminder.habitId);
  const audible = reminder.sound !== false && !quiet;

  return {
    title: isAlarm ? `⏰ ${habitName}` : `🔔 ${habitName}`,
    body: isAlarm
      ? 'Time to do it — tap "Done ✓" to check it off!'
      : 'Gentle nudge: time for this habit.',
    category: isAlarm ? CATEGORY_ALARM : CATEGORY_REMIND,
    sound: isAlarm ? (audible ? DEFAULT_ALARM_SOUND : undefined) : (audible ? 'default' : undefined),
    interruptionLevel: isAlarm ? 'timeSensitive' : 'active',
    data: {
      habitId: reminder.habitId,
      habitName,
      mode: reminder.repeat ?? 'off',
      date: reminder.date,
      time: reminder.time,
      audible,
      reminder: { ...reminder },
    },
  };
}

async function scheduleDateNotification(
  reminder: ReminderConfig,
  habitName: string,
  settings: NotificationSettings,
  when: Date,
  identifier: string
): Promise<void> {
  const { title, body, sound, interruptionLevel, category, data } = buildContent(reminder, habitName, settings);
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        sound,
        interruptionLevel,
        categoryIdentifier: category,
        data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: resolveChannel(reminder, settings),
      } as Notifications.DateTriggerInput,
    });
  } catch {}
}

/**
 * Which weekdays a repeating CALENDAR trigger should use, or null when the
 * habit's frequency shape can't be expressed as a straightforward repeat
 * (every-n-days, some-days-per-period, monthly, specific days of year) —
 * those fall back to precomputed occurrence windows.
 */
function calendarWeekdays(habit: Habit): number[] | null {
  const freq = habit.frequency;
  const mapWeekday = (d: number) => (d + 1) % 8; // JS 0=Sun..6=Sat -> expo 1=Sun..7=Sat

  const startsLaterThanTomorrow =
    parseDate(habit.startDate).getTime() - parseDate(todayStr()).getTime() > 1.5 * 86400000;
  // Habits with an end date can't use an unbounded repeat; occurrences beyond
  // endDate get dropped on each cold-start resync instead.
  if (habit.endDate || startsLaterThanTomorrow) return null;

  switch (freq.type) {
    case 'daily':
    case 'hourly':
      return []; // no weekDays -> repeats every day
    case 'weekly':
      return (freq.weekDays && freq.weekDays.length > 0
        ? freq.weekDays
        : [parseDate(habit.startDate).getDay()]
      ).map(mapWeekday);
    default:
      return null;
  }
}

async function scheduleCalendarRepeat(
  reminder: ReminderConfig,
  habitName: string,
  settings: NotificationSettings,
  weekDays: number[],
  identifier: string
): Promise<void> {
  const { hour, minute } = timeToParts(reminder.time);
  const trigger = {
    type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
    repeats: true,
    hour,
    minute,
    ...(weekDays.length > 0 ? { weekDays } : {}),
    channelId: resolveChannel(reminder, settings),
  } as unknown as Notifications.CalendarTriggerInput;

  const { title, body, sound, interruptionLevel, category, data } = buildContent(reminder, habitName, settings);
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        sound,
        interruptionLevel,
        categoryIdentifier: category,
        data,
      },
      trigger,
    });
  } catch {}
}

/**
 * Precomputes the next `maxSlots` dates on which the habit is actually
 * active and schedules one-shot DATE triggers for each. Re-run on every cold
 * start so the window always extends forward.
 */
async function scheduleOccurrenceWindow(
  reminder: ReminderConfig,
  habit: Habit,
  habitName: string,
  settings: NotificationSettings,
  maxSlots: number
): Promise<void> {
  let budget = MAX_SCHEDULED - (await Notifications.getAllScheduledNotificationsAsync()).length;
  const base = reminderBaseId(reminder);

  const [hour, minute] = [reminder.time.split(':').map(Number)[0], reminder.time.split(':').map(Number)[1]];
  const today = todayStr();
  const cursor = parseDate(today);

  for (let scanned = 0; scanned < 400 && maxSlots > 0 && budget > 0; scanned++) {
    const iso = formatDate(cursor);

    if (habit.endDate && iso > habit.endDate) break;

    const fireAt = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hour, minute, 0, 0);
    const isFuture = fireAt.getTime() > Date.now();
    if (iso >= habit.startDate && isFuture && isHabitActiveOnDate(habit, iso)) {
      await scheduleDateNotification(reminder, habitName, settings, fireAt, `${base}_${iso}`);
      maxSlots--;
      budget--;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
}

// ─── Public scheduling API ───────────────────────────────────────────────────

/** Cancels every scheduled notification whose id starts with `prefix`. */
async function cancelScheduledByIdPrefix(prefix: string): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of all) {
      const id = item?.identifier;
      if (typeof id === 'string' && id.startsWith(prefix)) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    }
  } catch {}
}

/** Cancels every schedule belonging to one reminder (calendar/window/etc). */
export async function cancelReminderSchedules(reminder: ReminderConfig): Promise<void> {
  await cancelScheduledByIdPrefix(reminderIdPrefix(reminder));
}

/** Cancels all schedules of a habit (used on habit delete / reminder clear). */
export async function cancelSchedulesByHabit(habitId: string): Promise<void> {
  await cancelScheduledByIdPrefix(`n_${habitId}_`);
  await cancelScheduledByIdPrefix(`${SNOOZE_PREFIX}${habitId}_`);
}

/** Cancels one scheduled notification by its exact id (in-app manager). */
export async function cancelScheduledById(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}

/** What {@link getScheduledNotificationsOverview} returns for one item. */
export interface ScheduledNotificationOverview {
  id: string;
  title: string;
  body: string;
  kind: 'reminder' | 'snooze' | 'smart' | 'celebration' | 'test' | 'other';
  /** Human summary: "Daily at 20:00", "Weekly (Mon) at 09:00", "Nov 12 · 07:00". */
  repeatSummary: string;
  /** Next fire time (epoch ms) where it can be derived, else null. */
  nextAt: number | null;
}

interface TriggerLike {
  type?: string;
  repeats?: boolean;
  date?: string | number | Date;
  hour?: number;
  minute?: number;
  weekDays?: number[];
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWhen(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getDate()} · ${hh}:${mm}`;
}

/** Grouping bucket for the in-app scheduled list, based on the id prefix. */
function deriveKind(id: string): ScheduledNotificationOverview['kind'] {
  if (id.startsWith('notif_test')) return 'test';
  if (id.startsWith(CELEBRATE_PREFIX)) return 'celebration';
  if (id.startsWith(SNOOZE_PREFIX)) return 'snooze';
  if (id.startsWith('smart_')) return 'smart';
  if (id.startsWith('n_')) return 'reminder';
  return 'other';
}

/** Defensive read of an expo trigger → next fire time & human summary. */
function describeTrigger(trigger: TriggerLike): { summary: string; nextAt: number | null } {
  // One-shot date trigger (one-time reminders, snoozes, celebrations).
  if (trigger.date !== undefined) {
    const d = new Date(trigger.date as string | number | Date);
    if (!Number.isNaN(d.getTime())) {
      return { summary: formatWhen(d.getTime()), nextAt: d.getTime() };
    }
  }

  // Calendar repeat at a fixed hour/minute.
  if (typeof trigger.hour === 'number' && typeof trigger.minute === 'number') {
    const time = `${String(trigger.hour).padStart(2, '0')}:${String(trigger.minute).padStart(2, '0')}`;
    const now = new Date();

    if (trigger.weekDays?.length) {
      // expo: 1 = Sunday .. 7 = Saturday (names[(d + 6) % 7] → JS 0 = Sunday).
      const days = trigger.weekDays.map((d) => WEEKDAY_NAMES[(d + 6) % 7]).join(', ');
      let nextAt: number | null = null;
      for (let i = 0; i < 8; i++) {
        const cand = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, trigger.hour, trigger.minute, 0, 0);
        if (cand.getTime() > now.getTime() && trigger.weekDays.includes(cand.getDay() + 1)) {
          nextAt = cand.getTime();
          break;
        }
      }
      return { summary: `Weekly (${days}) at ${time}`, nextAt };
    }

    let cand = new Date(now.getFullYear(), now.getMonth(), now.getDate(), trigger.hour, trigger.minute, 0, 0);
    if (cand.getTime() <= now.getTime()) cand = new Date(cand.getTime() + 86400000);
    return { summary: `Daily at ${time}`, nextAt: cand.getTime() };
  }

  return { summary: 'One-time', nextAt: null };
}

/**
 * Everything currently scheduled in the OS — reminders, smart alerts,
 * celebrations, snoozes, the test ping — for the in-app
 * "Scheduled Notifications" panel. Sorted by next fire time.
 */
export async function getScheduledNotificationsOverview(): Promise<ScheduledNotificationOverview[]> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all
      .map((req) => {
        const id = typeof req?.identifier === 'string' ? req.identifier : '';
        const content = req?.content;
        const info = describeTrigger((req?.trigger ?? {}) as unknown as TriggerLike);
        return {
          id,
          title: content?.title ?? 'Untitled notification',
          body: content?.body ?? '',
          kind: deriveKind(id),
          repeatSummary: info.summary,
          nextAt: info.nextAt,
        } satisfies ScheduledNotificationOverview;
      })
      .sort((a, b) => (a.nextAt ?? Number.MAX_SAFE_INTEGER) - (b.nextAt ?? Number.MAX_SAFE_INTEGER));
  } catch {
    return [];
  }
}

/**
 * Schedules (or reschedules) one reminder. Safe to call repeatedly with the
 * same reminder — previous schedules for that identity are cancelled first.
 */
export async function scheduleReminder(
  reminder: ReminderConfig,
  habit: Habit,
  settings?: NotificationSettings
): Promise<void> {
  // Disabled reminders (in-app manager switch) are stored but never scheduled.
  if (reminder.enabled === false) {
    await cancelReminderSchedules(reminder);
    return;
  }

  const service = await import('./habitService');
  const s = settings ?? (await service.loadNotificationSettings());

  if (!s.masterEnabled || reminder.type === 'none') {
    await cancelReminderSchedules(reminder);
    return;
  }

  await cancelReminderSchedules(reminder);

  const repeat: ReminderRepeatMode = reminder.repeat ?? 'off';
  const habitName = habit.name;

  // Archived habits must never fire reminders.
  if (habit.archived) return;

  if (repeat === 'daily') {
    // An unbounded calendar repeat would fire forever — beyond an endDate it's
    // noise next year (a reminder nags even after the habit ended). Habits
    // starting later than tomorrow can't be expressed by a calendar repeat
    // sensibly either: both fall back to the dated occurrence window, which
    // respects startDate/endDate and re-extends on every cold start.
    const startsLaterThanTomorrow =
      parseDate(habit.startDate).getTime() - parseDate(todayStr()).getTime() > 1.5 * 86400000;
    if (habit.endDate || startsLaterThanTomorrow) {
      await scheduleOccurrenceWindow(reminder, habit, habitName, s, WINDOW_SIZE);
    } else {
      await scheduleCalendarRepeat(reminder, habitName, s, [], `${reminderBaseId(reminder)}_cal`);
    }
    return;
  }

  if (repeat === 'habit') {
    const weekdays = calendarWeekdays(habit);
    if (weekdays) {
      await scheduleCalendarRepeat(reminder, habitName, s, weekdays, `${reminderBaseId(reminder)}_cal`);
    } else {
      await scheduleOccurrenceWindow(reminder, habit, habitName, s, WINDOW_SIZE);
    }
    return;
  }

  // repeat === 'off': one-shot on the anchor date; skip when already past.
  const when = new Date(`${reminder.date}T${reminder.time}:00`);
  if (when.getTime() <= Date.now()) return;
  await scheduleDateNotification(reminder, habitName, s, when, `${reminderBaseId(reminder)}_${reminder.date}`);
}

// ─── Smart-schedule data helpers ─────────────────────────────────────────────

interface SmartSnapshot {
  habits: Habit[];
  today: string;
  activeToday: Habit[];
  doneToday: Set<string>;
  pending: Habit[];
}

async function fetchSmartSnapshot(): Promise<SmartSnapshot> {
  const service = await import('./habitService');
  const [habits, completions] = await Promise.all([
    service.loadHabits(),
    service.loadCompletions(),
  ]);
  const today = todayStr();
  const activeToday = habits.filter((h) => !h.archived && isHabitActiveOnDate(h, today));
  // Credited write: quantity habits with ANY progress (count ≥ 1) count as done.
  const doneToday = new Set(
    completions.filter((c) => c.date === today && (c.completed || (c.count ?? 0) > 0)).map((c) => c.habitId)
  );
  const pending = activeToday.filter((h) => !doneToday.has(h.id));
  return { habits, today, activeToday, doneToday, pending };
}

function computeSmartBodies(snapshot: SmartSnapshot): {
  digestBody: string | null;
  guardBody: string | null;
  briefBody: string | null;
  middayBody: string | null;
} {
  const total = snapshot.activeToday.length;
  const done = snapshot.doneToday.size;

  const digestBody =
    total === 0
      ? 'No habits scheduled today — enjoy your rest day 😌'
      : done === total
        ? `🎉 ${done}/${total} done — perfect day, well played!`
        : done === 0
          ? `${total} habit${total !== 1 ? 's' : ''} waiting — check off the first one ⚡`
          : `🔥 ${done} of ${total} done — finish strong tonight!`;

  const pendingNames = snapshot.pending
    .slice(0, 2)
    .map((h) => h.name)
    .join(', ');
  const guardBody =
    snapshot.pending.length === 0
      ? '🎉 All habits done — your streaks are safe tonight!'
      : `${snapshot.pending.length} pending — ${pendingNames}${snapshot.pending.length > 2 ? '…' : ''}. Streaks wait for no one 🛡️`;

  const briefBody =
    total === 0
      ? null
      : `⚡ ${total} habit${total !== 1 ? 's' : ''} planned for today — start with a small win!`;

  const middayBody =
    total === 0
      ? null
      : done === 0
        ? `🌱 0 of ${total} checked so far — a two-minute win counts, start now!`
        : `💪 ${done} of ${total} checked — ${snapshot.pending.length} to go!`;

  return { digestBody, guardBody, briefBody, middayBody };
}

/** Credited completion keys — quantity habits with ANY progress are done. */
async function fetchCompletionMap(): Promise<Set<string>> {
  const service = await import('./habitService');
  const completions = await service.loadCompletions();
  return new Set(completions.filter((c) => c.completed || (c.count ?? 0) > 0).map((c) => c.key));
}

/**
 * Consecutive completed "active" days for a habit, counting back from `date`.
 * Delegates to the game layer so streak-freeze days keep the chain alive.
 */
function computeStreak(habit: Habit, completedKeys: Set<string>, dateStr: string): number {
  return computeHabitStreak(habit, completedKeys, dateStr, freezeCache?.get(habit.id));
}

/** Cached freeze days (habit → dates) so streak math stays synchronous. */
let freezeCache: Map<string, Set<string>> | null = null;
export async function refreshFreezeCache(): Promise<void> {
  try {
    const store = await loadFreezeStore();
    const map = new Map<string, Set<string>>();
    Object.keys(store.days).forEach((key) => {
      const habitId = key.slice(0, key.lastIndexOf('_'));
      const date = key.slice(key.lastIndexOf('_') + 1);
      const list = map.get(habitId) ?? new Set<string>();
      list.add(date);
      map.set(habitId, list);
    });
    freezeCache = map;
  } catch {
    freezeCache = new Map();
  }
}

/** True when every scheduled habit of `date` was left uncompleted. */
async function wasDayFullyMissed(habits: Habit[], dateStr: string): Promise<boolean> {
  const active = habits.filter((h) => !h.archived && isHabitActiveOnDate(h, dateStr));
  if (active.length === 0) return false;
  const doneKeys = await fetchCompletionMap();
  return active.every((h) => !doneKeys.has(`${h.id}_${dateStr}`));
}

// ─── Smart schedules (digest, guard, brief, nudge, recap, comeback) ──────────

async function scheduleDailyRepeat(
  id: string,
  time: string,
  channel: string,
  content: { title: string; body: string }
): Promise<void> {
  const { hour, minute } = timeToParts(time);
  const trigger = {
    type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
    repeats: true,
    hour,
    minute,
    channelId: channel,
  } as unknown as Notifications.CalendarTriggerInput;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: content.title,
        body: content.body,
        categoryIdentifier: CATEGORY_REMIND,
        data: { kind: 'smart' },
      },
      trigger,
    });
  } catch {}
}

async function scheduleWeeklyRepeat(
  id: string,
  time: string,
  weekDay: number,
  channel: string,
  content: { title: string; body: string }
): Promise<void> {
  const { hour, minute } = timeToParts(time);
  const trigger = {
    type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
    repeats: true,
    hour,
    minute,
    weekDays: [(weekDay + 1) % 8], // JS 0=Sun..6=Sat -> expo 1=Sun..7=Sat
    channelId: channel,
  } as unknown as Notifications.CalendarTriggerInput;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: content.title,
        body: content.body,
        categoryIdentifier: CATEGORY_REMIND,
        data: { kind: 'smart' },
      },
      trigger,
    });
  } catch {}
}

/** One-shot informational push (comeback nudges, celebrations). */
async function scheduleInfoNotification(
  identifier: string,
  when: Date,
  channel: string,
  content: { title: string; body: string },
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: content.title,
        body: content.body,
        categoryIdentifier: CATEGORY_REMIND,
        data: { kind: 'smart', ...(data ?? {}) },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: channel,
      } as Notifications.DateTriggerInput,
    });
  } catch {}
}

async function updateAppBadge(
  settings: NotificationSettings,
  pendingCount?: number
): Promise<void> {
  if (Platform.OS !== 'ios' || typeof Notifications.setBadgeCountAsync !== 'function') return;
  try {
    const count =
      settings.masterEnabled && settings.appBadgeEnabled
        ? Math.max(0, pendingCount ?? 0)
        : 0;
    await Notifications.setBadgeCountAsync(count);
  } catch {}
}

/**
 * Digest + streak-guard + morning brief + mid-day nudge + weekly recap +
 * conditional comeback nudge. Repeating triggers carry pre-computed dynamic
 * bodies; every app open / completion refreshes the content via
 * `refreshDynamicAlerts`, so the notifications always read fresh.
 */
export async function scheduleSmartSchedules(settings?: NotificationSettings): Promise<void> {
  const service = await import('./habitService');
  const s = settings ?? (await service.loadNotificationSettings());

  await cancelScheduledByIdPrefix(DIGEST_PREFIX);
  await cancelScheduledByIdPrefix(GUARD_PREFIX);
  await cancelScheduledByIdPrefix(CLOSEWARN_PREFIX);
  await cancelScheduledByIdPrefix(BRIEF_PREFIX);
  await cancelScheduledByIdPrefix(MIDDAY_PREFIX);
  await cancelScheduledByIdPrefix(RECAP_PREFIX);
  await cancelScheduledByIdPrefix(COMEBACK_PREFIX);

  const clearBadge = () => updateAppBadge(s, 0);

  if (!s.masterEnabled) {
    await clearBadge();
    return;
  }

  const snapshot = await fetchSmartSnapshot();
  const bodies = computeSmartBodies(snapshot);

  // ── Close-the-Day warning: retired. Days now close themselves at midnight
  // (next-day sweep), so there is nothing to warn about. The cancel below
  // still removes any schedule left over from before the retirement. ──

  if (s.digestEnabled && bodies.digestBody) {
    await scheduleDailyRepeat(
      `${DIGEST_PREFIX}${s.digestTime.replace(':', '')}`,
      s.digestTime,
      CH.digest,
      { title: 'Your Habits 🔥', body: bodies.digestBody }
    );
  }

  if (s.streakGuardEnabled && bodies.guardBody) {
    await scheduleDailyRepeat(
      `${GUARD_PREFIX}${s.streakGuardTime.replace(':', '')}`,
      s.streakGuardTime,
      CH.streakGuard,
      { title: 'Streak Guard 🛡️', body: bodies.guardBody }
    );
  }

  if (s.morningBriefEnabled && bodies.briefBody) {
    await scheduleDailyRepeat(
      `${BRIEF_PREFIX}${s.morningBriefTime.replace(':', '')}`,
      s.morningBriefTime,
      CH.brief,
      { title: 'Morning Brief ☀️', body: bodies.briefBody }
    );
  }

  if (s.middayNudgeEnabled && bodies.middayBody) {
    await scheduleDailyRepeat(
      `${MIDDAY_PREFIX}${s.middayNudgeTime.replace(':', '')}`,
      s.middayNudgeTime,
      CH.brief,
      { title: 'Mid-day Check-in 💪', body: bodies.middayBody }
    );
  }

  if (s.weeklyRecapEnabled) {
    await scheduleWeeklyRepeat(
      `${RECAP_PREFIX}${s.weeklyRecapDay}_${s.weeklyRecapTime.replace(':', '')}`,
      s.weeklyRecapTime,
      s.weeklyRecapDay,
      CH.digest,
      {
        title: 'Weekly Recap 📊',
        body: 'The week is done — see your wins, streaks and stats!',
      }
    );
  }

  if (s.comebackNudgeEnabled) {
    const yesterday = formatDate(new Date(parseDate(snapshot.today).getTime() - 86400000));
    const allMissed = await wasDayFullyMissed(snapshot.habits, yesterday);

    if (allMissed) {
      const { hour, minute } = timeToParts(s.comebackNudgeTime);
      const base = parseDate(snapshot.today);
      const fireAt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
      if (fireAt.getTime() > Date.now()) {
        await scheduleInfoNotification(
          `${COMEBACK_PREFIX}${snapshot.today}`,
          fireAt,
          CH.brief,
          {
            title: 'Fresh Start 💪',
            body: 'Yesterday slipped — today is a brand new page. One win fixes it!',
          },
          { date: snapshot.today }
        );
      }
    }
  }

  const pendingCount = snapshot.pending.length;
  await updateAppBadge(s, pendingCount);
}

/**
 * Throttled content refresh — called when the app comes to foreground so the
 * repeating smart notifications always carry up-to-date progress text.
 */
let lastSmartRefreshAt = 0;
export async function refreshDynamicAlerts(settings?: NotificationSettings): Promise<void> {
  const now = Date.now();
  if (now - lastSmartRefreshAt < 45000) return;
  lastSmartRefreshAt = now;
  try {
    await scheduleSmartSchedules(settings);
  } catch {}
}

/**
 * Completion pipeline hook: refreshes the dynamic notification bodies and
 * (optionally) pushes streak-milestone and perfect-day celebrations.
 * Called from the in-app toggle AND the notification "Done" action.
 */
export async function handleHabitCompleted(habitId: string, completed: boolean): Promise<void> {
  try {
    const service = await import('./habitService');
    const s = await service.loadNotificationSettings();
    if (!s.masterEnabled) return;

    const snapshot = await fetchSmartSnapshot();
    const habit = snapshot.habits.find((h) => h.id === habitId);
    if (!habit) return;

    if (completed) {
      const doneKeys = await fetchCompletionMap();

      if (s.milestonesEnabled) {
        const streak = computeStreak(habit, doneKeys, snapshot.today);
        if (MILESTONES.includes(streak)) {
          await scheduleInfoNotification(
            `${CELEBRATE_PREFIX}streak_${habitId}_${snapshot.today}`,
            new Date(Date.now() + 2000),
            CH.rewards,
            {
              title: `🔥 ${streak}-Day Streak!`,
              body: `${habit.name} — ${streak} days back-to-back. Keep the chain alive!`,
            },
            { habitId, habitName: habit.name }
          );
        }
      }

      if (
        s.perfectDayEnabled &&
        snapshot.activeToday.length > 0 &&
        snapshot.pending.length === 0
      ) {
        await scheduleInfoNotification(
          `${CELEBRATE_PREFIX}perfect_${snapshot.today}`,
          new Date(Date.now() + 2500),
          CH.rewards,
          {
            title: '🎉 Perfect Day!',
            body: `All ${snapshot.activeToday.length} habits done — your future self says thanks!`,
          },
          { date: snapshot.today }
        );
      }
    }

    // Pending counts changed → refresh smart-bodies + badge count.
    await scheduleSmartSchedules(s);
  } catch {}
}

/** Full resync: cancels everything, reschedules stored reminders + smart ones. */
export async function rebuildAllSchedules(): Promise<void> {
  try {
    const service = await import('./habitService');
    const [settings, reminders, habits] = await Promise.all([
      service.loadNotificationSettings(),
      service.loadReminders(),
      service.loadHabits(),
    ]);

    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!settings.masterEnabled) return;

    const byId = new Map(habits.map((h) => [h.id, h]));
    for (const reminder of reminders) {
      const habit = byId.get(reminder.habitId);
      if (!habit || reminder.type === 'none' || habit.archived) continue;
      await scheduleReminder(reminder, habit, settings);
    }
    await scheduleSmartSchedules(settings);
  } catch {}
}

// ─── Test / preview ──────────────────────────────────────────────────────────

/** Schedules a sample reminder ~2.5s from now using the current settings. */
export async function scheduleTestNotification(settings?: NotificationSettings): Promise<void> {
  const service = await import('./habitService');
  const s = settings ?? (await service.loadNotificationSettings());

  // A test should always demonstrate the real thing — ignore quiet hours.
  const testSettings: NotificationSettings = {
    ...s,
    quietHours: { ...s.quietHours, enabled: false },
  };

  const when = new Date(Date.now() + 2500);
  const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  const sample: ReminderConfig = {
    habitId: 'test',
    date: todayStr(),
    time,
    type: s.defaultType,
    sound: s.defaultSound,
    repeat: 'off',
    snoozeMinutes: 15,
  };

  await Notifications.cancelScheduledNotificationAsync('notif_test');
  await scheduleDateNotification(sample, 'Test Reminder', testSettings, when, 'notif_test');
}

// ─── Response handling (Done Snooze actions deep navigation) ─────────────────

const handledResponses = new Set<string>();

const ISO_DATE_TAIL = /(\d{4}-\d{2}-\d{2})$/;

/**
 * The date a "Done ✓" tap should credit:
 *   1. Per-date schedules (occurrence-window / one-shot / snoozed) stamp the
 *      fire date into the identifier suffix.
 *   2. Calendar repeats fire on their scheduled day → use the notification's
 *      own delivery date.
 *   3. Fallback: the reminder's anchor date, else today.
 */
export function resolveCompletionDate(
  response: Notifications.NotificationResponse,
  data: Record<string, unknown>
): string {
  try {
    // 1) Identifier suffix date.
    const id = response.notification?.request?.identifier ?? '';
    const tail = id.match(ISO_DATE_TAIL);
    if (tail && tail[1]) return tail[1];

    // 1b) Snoozed notifications carry the day the reminder was FOR in
    //     data.date. A snooze that crosses midnight fires on the NEW day —
    //     crediting the delivery date (2) would corrupt yesterday's streak,
    //     so for snoozes the stored anchor wins over the delivery date.
    if (id.startsWith(SNOOZE_PREFIX)) {
      const snoozeAnchor = typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null;
      if (snoozeAnchor) return snoozeAnchor;
    }

    // 2) The day the notification itself was scheduled to fire.
    const raw = (response.notification as { date?: number | string } | undefined)?.date;
    if (raw != null) {
      const n: number = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : new Date(raw).getTime();
      if (!Number.isNaN(n)) return formatDate(new Date(n));
    }

    // 3) Anchor date carried by the reminder (one-time reminders).
    const anchor = typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null;
    if (anchor) return anchor;
  } catch {}
  return todayStr();
}

export interface ResponseHandlingResult {
  handled: boolean;
  /** True when the plain tap should open the app (Today tab). */
  shouldNavigate: boolean;
}

/**
 * Handles a notification response: "Done" marks the habit complete for today,
 * "Snooze" reschedules the same reminder. Returns whether we handled it so
 * the caller knows whether to navigate.
 */
export async function handleNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<ResponseHandlingResult> {
  const key = `${response.notification?.request?.identifier ?? ''}|${response.actionIdentifier}`;
  if (handledResponses.has(key)) return { handled: true, shouldNavigate: false };
  handledResponses.add(key);
  if (handledResponses.size > 400) handledResponses.clear();

  const data = (response.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
  const habitId = typeof data.habitId === 'string' && data.habitId !== 'test' ? data.habitId : undefined;
  const habitName = typeof data.habitName === 'string' ? data.habitName : 'Habit';
  const reminder =
    data.reminder && typeof data.reminder === 'object' ? (data.reminder as ReminderConfig) : undefined;

  if (response.actionIdentifier === DONE_ACTION && habitId) {
    try {
      const service = await import('./habitService');
      const { notifyCompletionsChanged } = await import('./habitEvents');
      // Credit the day the reminder was FOR, not the day "Done" was tapped —
      // a snooze past midnight (or a day-anchored schedule) must not mark
      // today when the habit belonged to yesterday.
      const targetDate = resolveCompletionDate(response, data);
      // Quantity habits must fill to target, not bare-complete: markCompletion
      // alone writes a record without `count`, which paid full XP/coins for
      // partial (possibly 0/N) progress and corrupted the record shape — the
      // next in-app tap jumped straight to the target (count read as target).
      const habits = await service.loadHabits();
      const habit = habits.find((h) => h.id === habitId);
      if (habit?.targetCount && habit.targetCount > 0) {
        await service.fillQuantity(habitId, targetDate, habit.targetCount);
      } else {
        await service.markCompletion(habitId, targetDate);
      }
      notifyCompletionsChanged();
      // Same pipeline as in-app completion: XP/coins/combo/heal + milestones,
      // perfect day, badge. Idempotent — replays never double-pay.
      try {
        const xp = await import('./xpService');
        await xp.onHabitToggled(habitId, targetDate, true);
      } catch {}
      await handleHabitCompleted(habitId, true);
    } catch {}
    return { handled: true, shouldNavigate: false };
  }

  if ((response.actionIdentifier === SNOOZE_ACTION || response.actionIdentifier === SNOOZE_60_ACTION) && reminder && habitId) {
    try {
      const service = await import('./habitService');
      const settings = await service.loadNotificationSettings();
      const minutes =
        response.actionIdentifier === SNOOZE_60_ACTION
          ? 60
          : Math.max(1, reminder.snoozeMinutes ?? 15);
      const when = new Date(Date.now() + minutes * 60000);
      const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
      // Carry forward the day this reminder belonged to — a snooze that
      // crosses midnight must still credit the ORIGINAL day on "Done ✓".
      const dueDate = resolveCompletionDate(response, data);
      const snoozeReminder: ReminderConfig = {
        ...reminder,
        date: dueDate,
        time,
        repeat: 'off',
        sound: reminder.sound !== false,
      };
      await cancelScheduledByIdPrefix(`${SNOOZE_PREFIX}${habitId}_`);
      await scheduleDateNotification(
        snoozeReminder,
        habitName,
        settings,
        when,
        `${SNOOZE_PREFIX}${habitId}_${when.getTime()}`
      );
    } catch {}
    return { handled: true, shouldNavigate: false };
  }

  return { handled: false, shouldNavigate: true };
}

// ─── Legacy shims (kept for existing callers) ────────────────────────────────

/** @deprecated Use {@link scheduleReminder} — kept so old call sites work. */
export async function scheduleAlarm(reminder: ReminderConfig, habit: Habit): Promise<void> {
  await scheduleReminder(reminder, habit);
}

/** Compatibility exports. */
export async function getAllScheduledAlarms() {
  return await Notifications.getAllScheduledNotificationsAsync();
}

export async function cancelAllAlarms() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}
