import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ReminderConfig } from './types';

export async function initAlarms() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('habit-reminders', {
      name: 'Habit Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'musical_alarm.wav',
    });
  }
}

export async function scheduleAlarm(
  reminder: ReminderConfig,
  habitName: string
): Promise<string | undefined> {
  if (reminder.type === 'none') return;

  const [hours, minutes] = reminder.time.split(':').map(Number);
  const date = new Date(reminder.date + 'T' + reminder.time);

  if (date.getTime() <= Date.now()) return;

  const trigger = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
    channelId: 'habit-reminders',
  };

  const content: Notifications.NotificationContentInput = {
    title: 'Habit Alarm',
    body: `Time to: ${habitName}`,
    sound: 'musical_alarm.wav',
    data: { habitId: reminder.habitId, date: reminder.date, isAlarm: true },
  };

  const identifier = await Notifications.scheduleNotificationAsync({
    content,
    trigger,
  });

  return identifier;
}

export async function cancelAlarm(identifier: string) {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

export async function cancelAllAlarms() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getAllScheduledAlarms() {
  return await Notifications.getAllScheduledNotificationsAsync();
}
