// Powered by OnSpace.AI
import { Habit, HabitCompletion, StatRange, Category } from './types';
import { formatDate, parseDate, isHabitActiveOnDate } from './recurrenceService';

export interface HabitStat {
  habit: Habit;
  completed: number;
  total: number;
  rate: number;       // 0-1
  streak: number;
  longestStreak: number;
}

export interface DailyPoint {
  date: string;
  completed: number;
  total: number;
  rate: number;
}

export interface MonthPoint {
  label: string;
  completed: number;
  failed: number;
  skipped: number;
}

export interface PieData {
  completed: number;
  failed: number;
  skipped: number;
}

export interface AdvancedStats {
  longestStreak: number;
  longestStreakHabit: string;
  currentStreak: number;
  currentStreakHabit: string;
  mostSkippedHabit: string;
  mostCompletedHabit: string;
  bestCategory: string;
  worstCategory: string;
  weeklyConsistency: number;   // %
  monthlyProductivity: number; // %
  dailyAvg: number;
  bestDayOfWeek: string;
  worstDayOfWeek: string;
  growthPct: number;
}

function getDateRange(range: StatRange, refDate: Date): { start: Date; end: Date } {
  const end = new Date(refDate);
  end.setHours(23, 59, 59, 999);
  let start = new Date(refDate);
  switch (range) {
    case 'week':
      start.setDate(start.getDate() - 6);
      break;
    case 'month':
      start.setDate(1);
      break;
    case 'year':
      start = new Date(refDate.getFullYear(), 0, 1);
      break;
    case 'all':
      start = new Date(2020, 0, 1);
      break;
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function daysBetween(a: Date, b: Date): string[] {
  const days: string[] = [];
  const cur = new Date(a);
  while (cur <= b) {
    days.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function completionSet(completions: HabitCompletion[]): Set<string> {
  return new Set(completions.filter((c) => c.completed).map((c) => c.key));
}

export function computeHabitStats(
  habits: Habit[],
  completions: HabitCompletion[],
  range: StatRange,
  refDate: Date
): HabitStat[] {
  const { start, end } = getDateRange(range, refDate);
  const days = daysBetween(start, end);
  const done = completionSet(completions);
  const today = formatDate(new Date());

  return habits
    .filter((h) => !h.archived)
    .map((habit) => {
      let total = 0;
      let completed = 0;
      let streak = 0;
      let longestStreak = 0;
      let curStreak = 0;

      for (const day of days) {
        if (day > today) continue;
        if (!isHabitActiveOnDate(habit, day)) continue;
        total++;
        const isComp = done.has(`${habit.id}_${day}`);
        if (isComp) {
          completed++;
          curStreak++;
          if (curStreak > longestStreak) longestStreak = curStreak;
        } else {
          curStreak = 0;
        }
      }
      streak = curStreak;

      return {
        habit,
        completed,
        total,
        rate: total > 0 ? completed / total : 0,
        streak,
        longestStreak,
      };
    });
}

export function computeDailyPoints(
  habits: Habit[],
  completions: HabitCompletion[],
  range: StatRange,
  refDate: Date
): DailyPoint[] {
  const { start, end } = getDateRange(range, refDate);
  const days = daysBetween(start, end);
  const done = completionSet(completions);
  const today = formatDate(new Date());

  return days.map((day) => {
    if (day > today) return { date: day, completed: 0, total: 0, rate: 0 };
    const active = habits.filter((h) => !h.archived && isHabitActiveOnDate(h, day));
    const total = active.length;
    const completed = active.filter((h) => done.has(`${h.id}_${day}`)).length;
    return { date: day, completed, total, rate: total > 0 ? completed / total : 0 };
  });
}

export function computeMonthPoints(
  habits: Habit[],
  completions: HabitCompletion[],
  range: StatRange,
  refDate: Date
): MonthPoint[] {
  const done = completionSet(completions);
  const today = formatDate(new Date());

  if (range === 'week' || range === 'month') {
    // Group by week day or day
    const { start, end } = getDateRange(range, refDate);
    const days = daysBetween(start, end);
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    if (range === 'week') {
      return days.slice(-7).map((day) => {
        const d = parseDate(day);
        const label = DAY_NAMES[d.getDay()];
        if (day > today) return { label, completed: 0, failed: 0, skipped: 0 };
        const active = habits.filter((h) => !h.archived && isHabitActiveOnDate(h, day));
        const comp = active.filter((h) => done.has(`${h.id}_${day}`)).length;
        const fail = active.length - comp;
        return { label, completed: comp, failed: fail, skipped: 0 };
      });
    } else {
      // Month: group by week
      const weeks: MonthPoint[] = [];
      for (let i = 0; i < days.length; i += 7) {
        const chunk = days.slice(i, i + 7);
        const label = `W${Math.floor(i / 7) + 1}`;
        let comp = 0, fail = 0;
        for (const day of chunk) {
          if (day > today) continue;
          const active = habits.filter((h) => !h.archived && isHabitActiveOnDate(h, day));
          comp += active.filter((h) => done.has(`${h.id}_${day}`)).length;
          fail += active.filter((h) => !done.has(`${h.id}_${day}`)).length;
        }
        weeks.push({ label, completed: comp, failed: fail, skipped: 0 });
      }
      return weeks;
    }
  }

  // Year/All: group by month
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const { start, end } = getDateRange(range, refDate);
  const result: MonthPoint[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cur <= end) {
    const mStart = new Date(cur);
    const mEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const days = daysBetween(mStart, mEnd > end ? end : mEnd);
    const label = `${MONTHS[cur.getMonth()]}`;
    let comp = 0, fail = 0;
    for (const day of days) {
      if (day > today) continue;
      const active = habits.filter((h) => !h.archived && isHabitActiveOnDate(h, day));
      comp += active.filter((h) => done.has(`${h.id}_${day}`)).length;
      fail += active.filter((h) => !done.has(`${h.id}_${day}`)).length;
    }
    result.push({ label, completed: comp, failed: fail, skipped: 0 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

export function computePieData(
  habits: Habit[],
  completions: HabitCompletion[],
  range: StatRange,
  refDate: Date
): PieData {
  const { start, end } = getDateRange(range, refDate);
  const days = daysBetween(start, end);
  const done = completionSet(completions);
  const today = formatDate(new Date());

  let comp = 0, fail = 0, skip = 0;
  for (const day of days) {
    if (day > today) continue;
    for (const h of habits.filter((h) => !h.archived)) {
      if (!isHabitActiveOnDate(h, day)) continue;
      if (done.has(`${h.id}_${day}`)) comp++;
      else fail++;
    }
  }
  return { completed: comp, failed: fail, skipped: skip };
}

export function computeAdvancedStats(
  habits: Habit[],
  completions: HabitCompletion[],
  range: StatRange,
  refDate: Date
): AdvancedStats {
  const habitStats = computeHabitStats(habits, completions, range, refDate);
  const dailyPoints = computeDailyPoints(habits, completions, range, refDate);

  const done = completionSet(completions);
  const today = formatDate(new Date());
  const { start, end } = getDateRange(range, refDate);
  const days = daysBetween(start, end).filter((d) => d <= today);

  // Best/worst habit
  const sorted = [...habitStats].sort((a, b) => b.rate - a.rate);
  const mostCompleted = sorted[0]?.habit.name ?? '-';
  const mostSkipped = sorted[sorted.length - 1]?.habit.name ?? '-';

  // Longest/current streak
  let longestStreak = 0;
  let longestStreakHabit = '-';
  let currentStreak = 0;
  let currentStreakHabit = '-';
  for (const hs of habitStats) {
    if (hs.longestStreak > longestStreak) {
      longestStreak = hs.longestStreak;
      longestStreakHabit = hs.habit.name;
    }
    if (hs.streak > currentStreak) {
      currentStreak = hs.streak;
      currentStreakHabit = hs.habit.name;
    }
  }

  // Category performance
  const catMap: Record<string, { comp: number; total: number }> = {};
  for (const hs of habitStats) {
    const cat = hs.habit.category;
    if (!catMap[cat]) catMap[cat] = { comp: 0, total: 0 };
    catMap[cat].comp += hs.completed;
    catMap[cat].total += hs.total;
  }
  const catEntries = Object.entries(catMap).map(([k, v]) => ({ cat: k, rate: v.total > 0 ? v.comp / v.total : 0 }));
  const bestCat = catEntries.sort((a, b) => b.rate - a.rate)[0]?.cat ?? '-';
  const worstCat = catEntries.sort((a, b) => a.rate - b.rate)[0]?.cat ?? '-';

  // Day of week analysis
  const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dowMap: Record<number, { comp: number; total: number }> = {};
  for (const day of days) {
    const d = parseDate(day);
    const dow = d.getDay();
    if (!dowMap[dow]) dowMap[dow] = { comp: 0, total: 0 };
    for (const h of habits.filter((h) => !h.archived)) {
      if (!isHabitActiveOnDate(h, day)) continue;
      dowMap[dow].total++;
      if (done.has(`${h.id}_${day}`)) dowMap[dow].comp++;
    }
  }
  const dowEntries = Object.entries(dowMap).map(([k, v]) => ({ dow: parseInt(k), rate: v.total > 0 ? v.comp / v.total : 0 }));
  const bestDow = dowEntries.sort((a, b) => b.rate - a.rate)[0];
  const worstDow = dowEntries.sort((a, b) => a.rate - b.rate)[0];

  // Daily avg
  const completedDays = dailyPoints.filter((d) => d.total > 0);
  const dailyAvg = completedDays.length > 0
    ? completedDays.reduce((s, d) => s + d.rate, 0) / completedDays.length
    : 0;

  // Weekly consistency
  const last7 = dailyPoints.slice(-7).filter((d) => d.total > 0);
  const weeklyConsistency = last7.length > 0
    ? (last7.filter((d) => d.rate >= 0.5).length / last7.length) * 100
    : 0;

  // Monthly productivity
  const last30 = dailyPoints.slice(-30).filter((d) => d.total > 0);
  const monthlyProductivity = last30.length > 0
    ? (last30.reduce((s, d) => s + d.rate, 0) / last30.length) * 100
    : 0;

  // Growth %: compare first half vs second half
  const half = Math.floor(dailyPoints.length / 2);
  const firstHalf = dailyPoints.slice(0, half).filter((d) => d.total > 0);
  const secondHalf = dailyPoints.slice(half).filter((d) => d.total > 0);
  const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((s, d) => s + d.rate, 0) / firstHalf.length : 0;
  const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((s, d) => s + d.rate, 0) / secondHalf.length : 0;
  const growthPct = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

  return {
    longestStreak,
    longestStreakHabit,
    currentStreak,
    currentStreakHabit,
    mostSkippedHabit: mostSkipped,
    mostCompletedHabit: mostCompleted,
    bestCategory: bestCat,
    worstCategory: worstCat,
    weeklyConsistency,
    monthlyProductivity,
    dailyAvg: dailyAvg * 100,
    bestDayOfWeek: bestDow ? DOW_NAMES[bestDow.dow] : '-',
    worstDayOfWeek: worstDow ? DOW_NAMES[worstDow.dow] : '-',
    growthPct,
  };
}

export function computeSummaryCards(
  habits: Habit[],
  completions: HabitCompletion[],
  range: StatRange,
  refDate: Date
) {
  const { start, end } = getDateRange(range, refDate);
  const days = daysBetween(start, end);
  const done = completionSet(completions);
  const today = formatDate(new Date());

  let totalSlots = 0;
  let completed = 0;
  let failed = 0;

  for (const day of days) {
    if (day > today) continue;
    for (const h of habits.filter((h) => !h.archived)) {
      if (!isHabitActiveOnDate(h, day)) continue;
      totalSlots++;
      if (done.has(`${h.id}_${day}`)) completed++;
      else failed++;
    }
  }

  const skipped = 0;
  const successRate = totalSlots > 0 ? (completed / totalSlots) * 100 : 0;

  return { successRate, completed, failed, skipped, total: totalSlots };
}
