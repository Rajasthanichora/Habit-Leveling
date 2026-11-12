// Powered by OnSpace.AI
import { useMemo } from 'react';
import { Habit, SortConfig, Category } from '../services/types';
import { getHabitsForDate } from '../services/recurrenceService';

const CATEGORY_ORDER: Category[] = ['Health', 'Study', 'Work', 'Home', 'Other'];

function sortHabits(
  habits: Habit[],
  completionMap: Record<string, boolean>,
  config: SortConfig,
  quantityCounts?: Record<string, number>
): Habit[] {
  const arr = [...habits];
  const { mode, sortBy, order } = config;

  arr.sort((a, b) => {
    let result = 0;

    if (mode === 'manual') {
      return a.order - b.order;
    } else {
      switch (sortBy) {
        case 'name':
          result = a.name.localeCompare(b.name);
          break;
        case 'priority':
          result = a.priority - b.priority;
          break;
        case 'category':
          result = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
          break;
        case 'progress': {
          // Fraction of credited progress (quantity habits show partials).
          // After the filter both old sides were equal — the mode was a no-op.
          const frac = (h: Habit) => {
            const target = h.targetCount ?? 0;
            if (target > 0 && quantityCounts) {
              return Math.min(1, (quantityCounts[h.id] ?? 0) / target);
            }
            return completionMap[h.id] ? 1 : 0;
          };
          result = frac(a) - frac(b);
          break;
        }
        case 'time':
          result = a.createdAt.localeCompare(b.createdAt);
          break;
        default:
          result = a.order - b.order;
      }
    }

    return order === 'desc' ? -result : result;
  });

  return arr;
}

export function useSortedHabits(
  habits: Habit[],
  completionMap: Record<string, boolean>,
  sortConfig: SortConfig,
  selectedDate: string,
  activeFilter: string,
  /** habitId → today's count for quantity habits (credited partial progress). */
  quantityCounts?: Record<string, number>
) {
  return useMemo(() => {
    // Archived habits stay in storage for history/stats but must never
    // appear as today's tasks (stats module filters them — so should we).
    let forDate = getHabitsForDate(
      habits.filter((h) => !h.archived),
      selectedDate
    );

    // Split by completion
    const active = forDate.filter((h) => !completionMap[h.id]);
    const completed = forDate.filter((h) => completionMap[h.id]);

    // Apply category filter
    let filtered: Habit[];
    if (activeFilter === 'All') {
      filtered = active;
    } else if (activeFilter === 'Complete') {
      filtered = completed;
    } else {
      filtered = active.filter((h) => h.category === activeFilter);
    }

    // Apply sort
    const sorted = sortHabits(filtered, completionMap, sortConfig, quantityCounts);
    // The "Complete" view renders `completedHabits` — sort it too, or that
    // screen silently ignores the user's chosen sort for completed rows.
    const sortedCompleted = sortHabits(completed, completionMap, sortConfig, quantityCounts);

    // ── Progress: agree with the game's "credited" rule ──
    // The game credits a quantity habit with ANY progress (count ≥ 1) for its
    // day — streaks, penalties and perfect-day all use that rule (habitService
    // isDayCredited). A 3/8 habit is 3/8 of a done day, not a full miss, so
    // the bar counts its fraction instead of zeroing it.
    let creditedUnits = completed.length;
    forDate.forEach((h) => {
      if (completionMap[h.id]) return; // already fully counted
      const target = h.targetCount ?? 0;
      if (target <= 0) return;
      const count = quantityCounts?.[h.id] ?? 0;
      if (count > 0) creditedUnits += Math.min(1, count / target);
    });

    return {
      activeHabits: sorted,
      completedHabits: sortedCompleted,
      totalForDate: forDate.length,
      completedCount: completed.length,
      progress: forDate.length > 0 ? Math.min(1, creditedUnits / forDate.length) : 0,
    };
  }, [habits, completionMap, sortConfig, selectedDate, activeFilter, quantityCounts]);
}
