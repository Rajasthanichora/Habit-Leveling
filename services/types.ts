// Powered by OnSpace.AI

export type Category = string;
export type FrequencyType =
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'every_n_days'
  | 'some_days_per_period'
  | 'specific_days_of_year';

export type SortMode = 'global' | 'grouped' | 'manual';
export type SortBy = 'name' | 'time' | 'category' | 'progress' | 'priority';
export type SortOrder = 'asc' | 'desc';

export interface CategoryDef {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export interface FrequencyConfig {
  type: FrequencyType;
  everyNDays?: number;
  daysPerPeriod?: number;
  periodDays?: number;
  specificDates?: string[];
  weekDays?: number[];
  monthDays?: number[];
}

export interface Habit {
  id: string;
  name: string;
  category: Category;
  priority: number;
  startDate: string;   // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD
  frequency: FrequencyConfig;
  createdAt: string;
  order: number;
  archived?: boolean;
  sectionId: string;
  /** XP weight on completion; missing = 'medium'. */
  difficulty?: Difficulty;
  /** Quantity habit (e.g. "8 glasses of water"). Missing = binary habit. */
  targetCount?: number;
  /** Optional checklist under this habit (workout → exercise steps). */
  subHabits?: SubHabit[];
}

export interface SubHabit {
  id: string;
  title: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export type CompletionMood = 'great' | 'good' | 'ok' | 'rough';

export interface Section {
  id: string;
  name: string;
  createdAt: string;
}

export interface HabitCompletion {
  key: string;         // habitId_date
  habitId: string;
  date: string;        // YYYY-MM-DD
  completed: boolean;
  completedAt: string;
  mood?: CompletionMood;   // how the completion felt (mood patterns in stats)
  moodXp?: number;         // XP granted for the mood itself (diffed on mood change)
  count?: number;          // progress for quantity habits (target = habit.targetCount)
  /**
   * Drip XP earned by partial quantity steps (kept OUT of `xp` so the
   * completion pipeline is never blocked by leftover drip credits).
   */
  dripXp?: number;
  xp?: number;             // XP granted for this completion — deducted when un-completed
  coins?: number;          // coins granted for this completion — deducted when un-completed
}

// ─── XP & Levels (Phase 3) ───────────────────────────────────────────────

export interface XpState {
  totalXp: number;
}

export interface LevelInfo {
  level: number;
  title: string;
  levelStartXp: number;   // cumulative XP where the current level begins
  nextLevelXp: number;    // cumulative XP where the next level begins
  progress: number;       // 0..1 through the current level
}export interface FreezeWallet {
  month: string;        // 'YYYY-MM'
  used: number;
}

/** Limits & rewards of the streak-protection economy. */
export const GAME_RULES = {
  freezeMaxPerMonth: 2,
  bossBonusXp: 25,
  questRewardXp: 15,
  mediumQuestXp: 20,
  hardQuestXp: 25,
  secretQuestXp: 30,
  perfectDayXp: 20,
  moodBonus: { great: 4, good: 2, ok: 0, rough: 0 } as Record<CompletionMood, number>,
  milestoneXp: { 7: 50, 30: 150, 100: 400 } as Record<number, number>,
  subHabitAllDoneXp: 8,
} as const;

// ─── Reminders & Notifications ───────────────────────────────────────────

/**
 * alarm  = full-attention notification (MAX importance channel, custom sound,
 *          time-sensitive on iOS)
 * remind = gentle nudge (DEFAULT importance channel, can be silent)
 * none   = reminder is removed entirely (used as a "clear" signal when saving)
 */
export type ReminderType = 'alarm' | 'remind' | 'none';

/**
 * off   = one-time notification at the given date + time (legacy behaviour)
 * daily = fires every day at the reminder time
 * habit = fires only on days when the habit is scheduled to run
 *         (driven by the habit's FrequencyConfig)
 */
export type ReminderRepeatMode = 'off' | 'daily' | 'habit';

export interface ReminderConfig {
  habitId: string;
  date: string;        // YYYY-MM-DD anchor date (used when repeat === 'off')
  time: string;        // HH:mm
  type: ReminderType;
  sound: boolean;
  repeat?: ReminderRepeatMode;   // defaults to 'off' for legacy stored rows
  snoozeMinutes?: number;        // snooze button on the notification; default 15
  /** Disabled reminders are saved but never scheduled (in-app switch). */
  enabled?: boolean;
}

/** Quiet hours: mute sounds (and downgrade importance behaviour) in a window. */
export interface QuietHoursConfig {
  enabled: boolean;
  start: string;   // HH:mm
  end: string;     // HH:mm (may wrap past midnight, e.g. 22:00 -> 07:00)
}

export interface NotificationSettings {
  /** Global kill-switch: when false nothing is scheduled at all. */
  masterEnabled: boolean;
  /** Style offered as the default when creating a new reminder. */
  defaultType: Exclude<ReminderType, 'none'>;
  defaultSound: boolean;
  /** Daily evening summary ("check off today's habits"). */
  digestEnabled: boolean;
  digestTime: string;             // HH:mm
  /** Evening warning if habits are still pending. */
  streakGuardEnabled: boolean;
  streakGuardTime: string;        // HH:mm
  /** Quiet hours downgrade alarm/reminder sounds unless exempted. */
  quietHours: QuietHoursConfig;
  /** Habit ids that ignore quiet hours. */
  exemptHabitIds: string[];
  /** Morning plan summary ("5 habits today — make the day count"). */
  morningBriefEnabled: boolean;
  morningBriefTime: string;       // HH:mm
  /** Afternoon progress push ("2 of 7 done — 3 to go"). */
  middayNudgeEnabled: boolean;
  middayNudgeTime: string;        // HH:mm
  /** Weekly stats recap notification. */
  weeklyRecapEnabled: boolean;
  weeklyRecapDay: number;         // 0=Sun .. 6=Sat
  weeklyRecapTime: string;        // HH:mm
  /** "Yesterday slipped — fresh start" nudge after a fully-missed day. */
  comebackNudgeEnabled: boolean;
  comebackNudgeTime: string;      // HH:mm
  /** Push a celebration when a streak hits a milestone (7, 14, 30…). */
  milestonesEnabled: boolean;
  /** Push a celebration when every scheduled habit of the day is done. */
  perfectDayEnabled: boolean;
  /** iOS app-icon badge shows the pending-habit count. */
  appBadgeEnabled: boolean;
  /** "🔒 Day closes soon — N habits pending" warning (penalty system). */
  dayCloseWarnEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  masterEnabled: true,
  defaultType: 'alarm',
  defaultSound: true,
  digestEnabled: false,
  digestTime: '21:00',
  streakGuardEnabled: false,
  streakGuardTime: '20:00',
  quietHours: { enabled: false, start: '22:00', end: '07:00' },
  exemptHabitIds: [],
  morningBriefEnabled: true,
  morningBriefTime: '07:30',
  middayNudgeEnabled: false,
  middayNudgeTime: '14:00',
  weeklyRecapEnabled: false,
  weeklyRecapDay: 0,
  weeklyRecapTime: '18:00',
  comebackNudgeEnabled: true,
  comebackNudgeTime: '09:00',
  milestonesEnabled: true,
  perfectDayEnabled: true,
  appBadgeEnabled: true,
  dayCloseWarnEnabled: true,
};

export interface SortConfig {
  mode: SortMode;
  sortBy: SortBy;
  order: SortOrder;
}

export type StatRange = 'week' | 'month' | 'year' | 'all';
