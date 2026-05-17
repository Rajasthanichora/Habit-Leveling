// Powered by OnSpace.AI
import { useMemo } from 'react';
import { Habit, SortConfig, Category } from '../services/types';
import { getHabitsForDate } from '../services/recurrenceService';

const CATEGORY_ORDER: Category[] = ['Health', 'Study', 'Work', 'Home', 'Other'];

function sortHabits(
  habits: Habit[],
  completionMap: Record<string, boolean>,
  config: SortConfig
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
          const aComp = completionMap[a.id] ? 1 : 0;
          const bComp = completionMap[b.id] ? 1 : 0;
          result = aComp - bComp;
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
  activeFilter: string
) {
  return useMemo(() => {
    let forDate = getHabitsForDate(habits, selectedDate);

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
    const sorted = sortHabits(filtered, completionMap, sortConfig);

    return {
      activeHabits: sorted,
      completedHabits: completed,
      totalForDate: forDate.length,
      completedCount: completed.length,
      progress: forDate.length > 0 ? completed.length / forDate.length : 0,
    };
  }, [habits, completionMap, sortConfig, selectedDate, activeFilter]);
}
