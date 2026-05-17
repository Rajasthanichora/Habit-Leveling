// Powered by OnSpace.AI
import { useMemo } from 'react';
import { useHabits } from './useHabits';
import { StatRange } from '../services/types';
import {
  computeHabitStats,
  computeDailyPoints,
  computeMonthPoints,
  computePieData,
  computeAdvancedStats,
  computeSummaryCards,
} from '../services/statisticsService';

export function useStatistics(range: StatRange, refDate: Date, sectionId?: string) {
  const { habits, completions } = useHabits();
  const filteredHabits = sectionId
    ? habits.filter((h) => h.sectionId === sectionId)
    : habits;

  const habitStats = useMemo(
    () => computeHabitStats(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate.toDateString()]
  );

  const dailyPoints = useMemo(
    () => computeDailyPoints(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate.toDateString()]
  );

  const monthPoints = useMemo(
    () => computeMonthPoints(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate.toDateString()]
  );

  const pieData = useMemo(
    () => computePieData(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate.toDateString()]
  );

  const advancedStats = useMemo(
    () => computeAdvancedStats(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate.toDateString()]
  );

  const summary = useMemo(
    () => computeSummaryCards(filteredHabits, completions, range, refDate),
    [filteredHabits, completions, range, refDate.toDateString()]
  );

  return { habitStats, dailyPoints, monthPoints, pieData, advancedStats, summary };
}
