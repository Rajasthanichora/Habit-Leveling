import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ReminderConfig, SoundConfig } from './types';
import { loadSoundConfig } from './habitService';

let soundConfig: SoundConfig = { vibrationOnTap: true, completionSound: true, deleteSound: true, alarmSound: 'chime', notificationSound: true };

export async function initNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('habit-reminders', {
      name: 'Habit Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  const snd = await loadSoundConfig();
  soundConfig = snd;
}

export function updateNotificationSoundConfig(config: SoundConfig) {
  soundConfig = config;
}

export async function scheduleReminderNotification(
  reminder: ReminderConfig,
  habitName: string
): Promise<string | undefined> {
  if (reminder.type === 'none') return;

  const [hours, minutes] = reminder.time.split(':').map(Number);
  const date = new Date(reminder.date + 'T' + reminder.time);

  if (date.getTime() <= Date.now()) return;

  const soundName = reminder.sound && soundConfig.notificationSound ? soundConfig.alarmSound : undefined;

  const trigger = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
    channelId: 'habit-reminders',
  };

  const content: Notifications.NotificationContentInput = {
    title: 'Habit Reminder',
    body: `Time to: ${habitName}`,
    sound: soundName,
    data: { habitId: reminder.habitId, date: reminder.date },
  };

  const identifier = await Notifications.scheduleNotificationAsync({
    content,
    trigger,
  });

  return identifier;
}

export async function cancelReminderNotification(identifier: string) {
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

export async function cancelAllReminderNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getAllScheduledNotifications() {
  return await Notifications.getAllScheduledNotificationsAsync();
}
