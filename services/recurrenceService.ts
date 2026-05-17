// Powered by OnSpace.AI
import { Habit, FrequencyConfig } from './types';

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayStr(): string {
  return formatDate(new Date());
}

export function isHabitActiveOnDate(habit: Habit, dateStr: string): boolean {
  const date = parseDate(dateStr);
  const start = parseDate(habit.startDate);
  if (date < start) return false;
  if (habit.endDate) {
    const end = parseDate(habit.endDate);
    if (date > end) return false;
  }

  const freq = habit.frequency;

  switch (freq.type) {
    case 'daily':
      return true;

    case 'hourly':
      return true;

    case 'weekly': {
      const dayOfWeek = date.getDay();
      if (freq.weekDays && freq.weekDays.length > 0) {
        return freq.weekDays.includes(dayOfWeek);
      }
      // Default: same day of week as start
      return dayOfWeek === start.getDay();
    }

    case 'monthly': {
      if (freq.monthDays && freq.monthDays.length > 0) {
        return freq.monthDays.includes(date.getDate());
      }
      return date.getDate() === start.getDate();
    }

    case 'every_n_days': {
      const n = freq.everyNDays ?? 1;
      const diff = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff % n === 0;
    }

    case 'some_days_per_period': {
      const dpp = freq.daysPerPeriod ?? 1;
      const period = freq.periodDays ?? 7;
      const diff = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diff < 0) return false;
      const dayInPeriod = diff % period;
      return dayInPeriod < dpp;
    }

    case 'specific_days_of_year': {
      if (!freq.specificDates || freq.specificDates.length === 0) return false;
      const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return freq.specificDates.includes(mmdd);
    }

    default:
      return true;
  }
}

export function getHabitsForDate(habits: Habit[], dateStr: string): Habit[] {
  return habits.filter((h) => isHabitActiveOnDate(h, dateStr));
}

export function getFrequencyLabel(freq: FrequencyConfig): string {
  switch (freq.type) {
    case 'hourly': return 'Every Hour';
    case 'daily': return 'Every Day';
    case 'weekly':
      if (freq.weekDays && freq.weekDays.length > 0) {
        const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return 'Weekly: ' + freq.weekDays.map((d) => names[d]).join(', ');
      }
      return 'Weekly';
    case 'monthly': return 'Monthly';
    case 'every_n_days': return `Every ${freq.everyNDays ?? 1} days`;
    case 'some_days_per_period':
      return `${freq.daysPerPeriod ?? 1} days per ${freq.periodDays ?? 7} days`;
    case 'specific_days_of_year':
      return `${freq.specificDates?.length ?? 0} specific days/year`;
    default: return 'Custom';
  }
}
