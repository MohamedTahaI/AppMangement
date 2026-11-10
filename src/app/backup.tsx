import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getSetting, setSetting } from '@/db/settings';
import { createDatabaseBackup } from '@/services/backup';
import { arabicErrorMessage } from '@/services/errors';
import {
  getNotificationPermission,
  requestNotificationPermission,
  scheduleBackupReminders,
  setBackupRemindersEnabled,
} from '@/services/reminders';
import { theme } from '@/theme';
import { formatDate } from '@/utils/format';

export default function BackupScreen() {
  const router = useRouter();
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [permissionPromptVisible, setPermissionPromptVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [lastBackup, reminders, permission, permissionAsked] = await Promise.all([
      getSetting('last_backup_at'),
      getSetting('backup_reminders_enabled'),
      getNotificationPermission().catch(() => ({ granted: false, canAskAgain: true })),
      getSetting('backup_permission_asked'),
    ]);
    setLastBackupAt(lastBackup);
    setRemindersEnabled(reminders !== '0');
    setPermissionPromptVisible(!permission.granted && permission.canAskAgain && permissionAsked !== '1');
  }, []);

  useFocusEffect(useCallback(() => {
    void load().catch((loadError: unknown) => {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل إعدادات النسخة الاحتياطية.'));
    });
    void scheduleBackupReminders().catch(() => undefined);
  }, [load]));

  const toggleReminders = async (value: boolean) => {
    setRemindersEnabled(value);
    setError(null);
    try {
      await setBackupRemindersEnabled(value);
    } catch (toggleError) {
      setRemindersEnabled(!value);
      setError(arabicErrorMessage(toggleError, 'تعذر حفظ إعداد التذكير.'));
    }
  };

  const enableNotifications = async () => {
    setError(null);
    try {
      const granted = await requestNotificationPermission();
      await setSetting('backup_permission_asked', '1');
      setPermissionPromptVisible(false);
      if (granted) {
        await scheduleBackupReminders();
        setNotice('تم تفعيل التذكير الأسبوعي بالنسخة الاحتياطية.');
      } else {
        setError('لم يتم تفعيل الإشعارات. يمكنك تفعيلها من إعدادات الهاتف.');
      }
    } catch (permissionError) {
      setError(arabicErrorMessage(permissionError, 'تعذر طلب إذن الإشعارات.'));
    }
  };

  const dismissPermissionPrompt = async () => {
    setPermissionPromptVisible(false);
    await setSetting('backup_permission_asked', '1').catch(() => undefined);
  };

  const backupNow = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const backup = await createDatabaseBackup();
      const file = new File(Paths.cache, `نسخة-احتياطية-العمارة-${backup.createdAt.slice(0, 10)}.json`);
      file.create({ intermediates: true, overwrite: true });
      await file.write(JSON.stringify(backup, null, 2));
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'حفظ نسخة احتياطية من بيانات العمارة',
      });
      await setSetting('last_backup_at', new Date().toISOString());
      await scheduleBackupReminders().catch(() => undefined);
      await load();
      setNotice('تم تجهيز النسخة الاحتياطية وفتح قائمة المشاركة.');
    } catch (backupError) {
      setError(arabicErrorMessage(backupError, 'تعذر إنشاء النسخة الاحتياطية.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BackButton onPress={() => router.back()} label="رجوع" />
      <ScreenTitle title="النسخة الاحتياطية" subtitle="احفظ نسخة من بياناتك أسبوعياً" />
      {permissionPromptVisible ? (
        <Card style={styles.card}>
          <SectionHeader title="تفعيل التذكير الأسبوعي" />
          <AppText style={styles.hint}>
            نحتاج إذن الإشعارات لنذكّرك بالنسخة الاحتياطية مرة كل أسبوع. لن نستخدم الإشعارات لأي شيء آخر.
          </AppText>
          <BigButton title="تفعيل التنبيهات" onPress={() => void enableNotifications()} />
          <Pressable accessibilityRole="button" onPress={() => void dismissPermissionPrompt()} style={styles.restoreLink}>
            <AppText style={styles.restoreText}>ليس الآن</AppText>
          </Pressable>
        </Card>
      ) : null}
      <Card style={styles.card}>
        <SectionHeader title="آخر نسخة احتياطية" />
        <AppText style={styles.date}>
          {lastBackupAt ? formatDate(lastBackupAt) : 'لا توجد نسخة احتياطية بعد'}
        </AppText>
        <View style={styles.switchRow}>
          <AppText style={styles.switchLabel}>تنبيه أسبوعي بالنسخة الاحتياطية</AppText>
          <Switch
            value={remindersEnabled}
            onValueChange={(value) => void toggleReminders(value)}
            trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
            accessibilityLabel="تنبيه أسبوعي بالنسخة الاحتياطية"
          />
        </View>
      </Card>
      <BigButton title={busy ? 'جارٍ التجهيز...' : 'حفظ نسخة الآن'} disabled={busy} onPress={() => void backupNow()} />
      <AppText style={styles.hint}>
        بعد حفظ النسخة، أرسلها إلى واتساب أو Google Drive حتى تبقى محفوظة خارج الهاتف.
      </AppText>
      <Pressable accessibilityRole="button" onPress={() => router.push('/export-backup')} style={styles.restoreLink}>
        <AppText style={styles.restoreText}>استعادة نسخة احتياطية قديمة</AppText>
      </Pressable>
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
      {notice ? <AppText style={styles.success}>{notice}</AppText> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: theme.spacingScale.screen,
    paddingTop: theme.spacingScale.md,
    paddingBottom: theme.spacingScale.lg,
    gap: theme.spacingScale.sm,
    backgroundColor: theme.colors.background,
    writingDirection: 'rtl',
  },
  card: { gap: theme.spacingScale.sm },
  date: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  switchRow: {
    minHeight: theme.sizes.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacingScale.sm,
  },
  switchLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.medium,
    textAlign: 'auto',
  },
  hint: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  restoreLink: {
    minHeight: theme.sizes.touch,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  restoreText: {
    color: theme.colors.primary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
    textDecorationLine: 'underline',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  success: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
});
