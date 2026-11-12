// Powered by OnSpace.AI
import { useContext } from 'react';
import { HabitContext, HabitContextType } from '../contexts/HabitContext';

export function useHabits(): HabitContextType {
  const ctx = useContext(HabitContext);
  if (!ctx) throw new Error('useHabits must be used within HabitProvider');
  return ctx;
}
