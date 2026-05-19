import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HabitProvider } from '../contexts/HabitContext';
import { initAlarms, cancelAllAlarms, scheduleAlarm } from '../services/notificationService';
import { loadReminders, loadHabits } from '../services/habitService';
import { initAudio, preloadCommonSounds } from '../services/soundService';

function AlarmInit() {
  useEffect(() => {
    (async () => {
      try {
        await initAudio();
        preloadCommonSounds();
        await initAlarms();
        await cancelAllAlarms();
        const reminders = await loadReminders();
        const habits = await loadHabits();
        for (const reminder of reminders) {
          if (reminder.type === 'none') continue;
          const habit = habits.find((h) => h.id === reminder.habitId);
          if (habit) {
            await scheduleAlarm(reminder, habit.name);
          }
        }
      } catch {}
    })();
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HabitProvider>
        <AlarmInit />
        <Stack screenOptions={{ headerShown: false }} />
      </HabitProvider>
    </GestureHandlerRootView>
  );
}
