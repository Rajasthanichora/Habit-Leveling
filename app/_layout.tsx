import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HabitProvider } from '../contexts/HabitContext';
import { initNotifications, updateNotificationSoundConfig, scheduleReminderNotification, cancelAllReminderNotifications } from '../services/notificationService';
import { loadSoundConfig, loadReminders, loadHabits } from '../services/habitService';

function NotificationInit() {
  useEffect(() => {
    (async () => {
      try {
        await initNotifications();
        const snd = await loadSoundConfig();
        updateNotificationSoundConfig(snd);
        await cancelAllReminderNotifications();
        const reminders = await loadReminders();
        const habits = await loadHabits();
        for (const reminder of reminders) {
          if (reminder.type === 'none') continue;
          const habit = habits.find((h) => h.id === reminder.habitId);
          if (habit) {
            const nid = await scheduleReminderNotification(reminder, habit.name);
            if (nid && nid !== reminder.notificationId) {
              reminder.notificationId = nid;
            }
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
        <NotificationInit />
        <Stack screenOptions={{ headerShown: false }} />
      </HabitProvider>
    </GestureHandlerRootView>
  );
}
