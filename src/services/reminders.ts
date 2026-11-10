import * as Notifications from 'expo-notifications';
import { AndroidImportance, SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import { getSetting, setSetting } from '@/db/settings';

const CHANNEL_ID = 'backup-reminders';
const REMINDER_TAG = 'backup-reminder';
const DEFAULT_HOUR = 10;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function getNotificationPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'تذكير النسخة الاحتياطية',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  return { granted: current.granted, canAskAgain: current.canAskAgain };
}

export async function requestNotificationPermission(): Promise<boolean> {
  return ensureNotificationPermission(true);
}

export async function ensureNotificationPermission(request: boolean): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'تذكير النسخة الاحتياطية',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!request || !current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function cancelBackupReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const reminders = scheduled.filter((item) => item.content.data?.tag === REMINDER_TAG);
  await Promise.all(reminders.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

function reminderDate(daysFromNow: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(DEFAULT_HOUR, 0, 0, 0);
  return date;
}

function daysFrom(lastBackupAt: string | null): number[] {
  if (!lastBackupAt) return [1, 8, 15, 22];
  const last = new Date(lastBackupAt);
  if (Number.isNaN(last.getTime())) return [1, 8, 15, 22];
  const week = 7 * 24 * 60 * 60 * 1000;
  const stale = Date.now() - last.getTime() > week;
  return stale ? [1, 8, 15, 22] : [7, 14, 21, 28];
}

export async function scheduleBackupReminders(): Promise<void> {
  const enabled = (await getSetting('backup_reminders_enabled')) !== '0';
  if (!enabled) {
    await cancelBackupReminders();
    return;
  }
  const allowed = await ensureNotificationPermission(false).catch(() => false);
  if (!allowed) return;
  await cancelBackupReminders();
  const lastBackupAt = await getSetting('last_backup_at');
  for (const offset of daysFrom(lastBackupAt)) {
    const date = reminderDate(offset);
    if (date.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'نسخة احتياطية',
        body: 'مر أسبوع على آخر نسخة احتياطية. احفظ نسخة الآن عشان بياناتك ما تضيعش',
        data: { tag: REMINDER_TAG },
        sound: false,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });
  }
}

export async function setBackupRemindersEnabled(enabled: boolean): Promise<void> {
  await setSetting('backup_reminders_enabled', enabled ? '1' : '0');
  if (enabled) {
    await ensureNotificationPermission(true).catch(() => false);
    await scheduleBackupReminders();
  } else {
    await cancelBackupReminders();
  }
}

export function isBackupReminderResponse(response: Notifications.NotificationResponse): boolean {
  return response.notification.request.content.data?.tag === REMINDER_TAG;
}
