// Powered by OnSpace.AI
import { useEffect, useMemo, useState } from 'react';
import { useHabits } from './useHabits';
import { Habit, StatRange } from '../services/types';
import {
  computeHabitStats,
  computeDailyPoints,
  computeMonthPoints,
  computePrevMonthPoints,
  computePieData,
  computeAdvancedStats,
  computeSummaryCards,
} from '../services/statisticsService';
import { isHabitActiveOnDate } from '../services/recurrenceService';

/**
 * Keys (`habitId_date`) whose miss is "protected" — streak freeze ❄ days and
 * whole-day Skip Pass 🎫 days. They surface as the Skipped segment (neither a
 * success nor a failure) in the stats.
 */
export function useProtectedDayKeys(habits: Habit[]): Set<string> {
  const [graced, setGraced] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [streak, penalty] = await Promise.all([
          import('../services/streakService'),
          import('../services/penaltyService'),
        ]);
        const [freezeStore, penaltyStore] = await Promise.all([
          streak.loadFreezeStore(),
          penalty.loadPenaltyStore(),
        ]);
        const next = new Set<string>(Object.keys(freezeStore.days ?? {}));
        for (const [date, closure] of Object.entries(penaltyStore.closures ?? {})) {
          if (!closure.skipPassUsed) continue;
          // A whole-day Skip Pass waives every habit that was scheduled then.
          for (const h of habits) {
            if (!h.archived && isHabitActiveOnDate(h, date)) next.add(`${h.id}_${date}`);
          }
        }
        if (!cancelled) setGraced(next);
      } catch {
        if (!cancelled) setGraced(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [habits]);

  return graced;
}

export function useStatistics(range: StatRange, refDate: Date, sectionId?: string) {
  const { habits, completions } = useHabits();
  // Memoized: useProtectedDayKeys re-loads whenever this identity changes —
  // an inline filter() would churn a fresh array every render.
  const filteredHabits = useMemo(
    () => (sectionId ? habits.filter((h) => h.sectionId === sectionId) : habits),
    [habits, sectionId]
  );
  const graced = useProtectedDayKeys(filteredHabits);

  const habitStats = useMemo(
    () => computeHabitStats(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate]
  );

  const dailyPoints = useMemo(
    () => computeDailyPoints(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate]
  );

  const monthPoints = useMemo(
    () => computeMonthPoints(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate]
  );

  const pieData = useMemo(
    () => computePieData(filteredHabits, completions, range, refDate, graced),
    [filteredHabits, completions, range, refDate, graced]
  );

  // Heatmap always shows the last 12 weeks (84 days), independent of the selected range.
  const heatmapDailyPoints = useMemo(
    () => computeDailyPoints(filteredHabits, completions, 'all', refDate),
    [filteredHabits, completions, refDate]
  );

  const advancedStats = useMemo(
    () => computeAdvancedStats(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate]
  );

  const prevMonthPoints = useMemo(
    () => computePrevMonthPoints(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate]
  );

  const summary = useMemo(
    () => computeSummaryCards(filteredHabits, completions, range, refDate, graced),
    [filteredHabits, completions, range, refDate, graced]
  );

  return { habitStats, dailyPoints, heatmapDailyPoints, monthPoints, prevMonthPoints, pieData, advancedStats, summary };
}
