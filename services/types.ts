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
}

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
}

export type ReminderType = 'alarm' | 'none';

export interface ReminderConfig {
  habitId: string;
  date: string;        // YYYY-MM-DD
  time: string;        // HH:mm
  type: ReminderType;
  sound: boolean;
  vibration: boolean;
}

export interface SortConfig {
  mode: SortMode;
  sortBy: SortBy;
  order: SortOrder;
}

export type StatRange = 'week' | 'month' | 'year' | 'all';

export interface SoundConfig {
  vibrationOnTap: boolean;
  completionSound: boolean;
  deleteSound: boolean;
  alarmSound: string;
}

export const DEFAULT_SOUND_CONFIG: SoundConfig = {
  vibrationOnTap: true,
  completionSound: true,
  deleteSound: true,
  alarmSound: 'musical_alarm',
};

// ─── API Config ──────────────────────────────────────────────────────────

export type ApiProvider = 'gemini' | 'openrouter';

export interface ApiConfig {
  gemini: {
    apiKey: string;
    model: string;
  };
  openrouter: {
    apiKey: string;
    model: string;
  };
}

export const DEFAULT_API_CONFIG: ApiConfig = {
  gemini: { apiKey: '', model: 'gemini-2.0-flash-lite' },
  openrouter: { apiKey: '', model: 'deepseek/deepseek-chat' },
};

// ─── Analysis Config ──────────────────────────────────────────────────────

export type AnalysisFrequency = 'none' | 'minutes' | 'hourly' | 'daily' | 'weekly';
export type AiLanguage = 'english' | 'hindi' | 'hinglish';

export interface AnalysisConfig {
  frequency: AnalysisFrequency;
  minutesInterval?: number;
  hoursInterval?: number;
  weekDays?: number[];
  language?: AiLanguage;
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  frequency: 'none',
  minutesInterval: 5,
  hoursInterval: 1,
  weekDays: [1, 2, 3, 4, 5],
  language: 'english',
};

// ─── Analysis History ─────────────────────────────────────────────────────

export type TriggerTag = 'manual_analysis' | 'chat_analysis' | 'auto_analysis';

export interface AnalysisHistoryEntry {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  type: 'chat' | 'analysis';
  summary: string;
  sectionId?: string;
  triggerTag?: TriggerTag;
}
