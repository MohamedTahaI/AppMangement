import { File, Paths } from 'expo-file-system';
import { copyAsync, deleteAsync, readAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { BackButton } from '@/components/ui/BackButton';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getSetting, setSetting } from '@/db/settings';
import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  validateDatabaseBackup,
  type DatabaseBackup,
} from '@/services/backup';
import { arabicErrorMessage } from '@/services/errors';
import {
  getNotificationPermission,
  requestNotificationPermission,
  scheduleBackupReminders,
  setBackupRemindersEnabled,
} from '@/services/reminders';
import { theme } from '@/theme';
import { formatDate } from '@/utils/format';

async function readPickedFile(uri: string): Promise<string> {
  let directError: unknown = null;
  try {
    return await new File(uri).text();
  } catch (error) {
    directError = error;
  }
  const cached = new File(Paths.cache, `restore-${Date.now()}.json`);
  try {
    await copyAsync({ from: uri, to: cached.uri });
    return await readAsStringAsync(cached.uri, { encoding: 'utf8' });
  } catch (fallbackError) {
    const detail = [directError, fallbackError]
      .map((error) => (error instanceof Error ? error.message : String(error)))
      .filter(Boolean)
      .join(' | ');
    throw new Error(`تعذر قراءة الملف من الجهاز. (${detail})`, { cause: fallbackError });
  } finally {
    await deleteAsync(cached.uri, { idempotent: true }).catch(() => undefined);
  }
}

function technicalError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    return [error.message, error.stack, cause instanceof Error ? `السبب: ${cause.message}\n${cause.stack ?? ''}` : '']
      .filter(Boolean)
      .join('\n');
  }
  return String(error);
}

function arabicFailure(error: unknown, fallback: string): string {
  if (error instanceof Error && /[؀-ۿ]/u.test(error.message) && !/[A-Za-z]/u.test(error.message)) {
    return error.message;
  }
  return fallback;
}

export default function BackupScreen() {
  const router = useRouter();
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [permissionPromptVisible, setPermissionPromptVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState<DatabaseBackup | null>(null);

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
    setErrorDetail(null);
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

  const reportRestoreFailure = (context: string, cause: unknown, fallback: string) => {
    if (__DEV__) console.error(context, cause, technicalError(cause));
    setError(arabicFailure(cause, fallback));
    setErrorDetail(technicalError(cause));
    setDetailsOpen(false);
  };

  const chooseBackup = async () => {
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    setNotice(null);
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['*/*'] });
      if (picked.canceled || !picked.result) return;
      const contents = await readPickedFile(picked.result.uri);
      let parsed: unknown;
      try {
        parsed = JSON.parse(contents.replace(/^﻿/, '')) as unknown;
      } catch (parseError) {
        throw new Error('الملف ليس نسخة احتياطية من هذا التطبيق.', { cause: parseError });
      }
      const validated = validateDatabaseBackup(parsed);
      setPendingBackup(validated);
    } catch (restoreError) {
      reportRestoreFailure('Backup selection or validation failed', restoreError, 'تعذر قراءة ملف النسخة الاحتياطية.');
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (!pendingBackup) return;
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    setNotice(null);
    try {
      await restoreDatabaseBackup(pendingBackup);
      setPendingBackup(null);
      router.replace({ pathname: '/(tabs)', params: { restored: String(Date.now()) } });
    } catch (restoreError) {
      setPendingBackup(null);
      reportRestoreFailure('Backup restore failed', restoreError, 'تعذرت استعادة النسخة. لم يتم تغيير البيانات.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen>
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
        <Section title="آخر نسخة احتياطية">
          <Card style={styles.card}>
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
        </Section>
        <Section title="استعادة نسخة قديمة">
          <BigButton
            title={busy ? 'جارٍ الفتح...' : 'استعادة نسخة احتياطية قديمة'}
            variant="secondary"
            disabled={busy}
            onPress={() => void chooseBackup()}
          />
        </Section>
        {error ? (
          <View style={styles.errorBox}>
            <AppText style={styles.error}>{error}</AppText>
            {errorDetail ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: detailsOpen }}
                  onPress={() => setDetailsOpen((open) => !open)}
                  style={styles.detailsToggle}>
                  <AppText style={styles.detailsLabel}>{detailsOpen ? 'إخفاء التفاصيل' : 'تفاصيل'}</AppText>
                </Pressable>
                {detailsOpen ? <AppText selectable style={styles.errorDetail}>{errorDetail}</AppText> : null}
              </>
            ) : null}
          </View>
        ) : null}
        {notice ? <AppText style={styles.success}>{notice}</AppText> : null}
      </Screen>

      <ConfirmDialog
        visible={pendingBackup !== null}
        title="تحذير: استبدال جميع البيانات"
        message={`سيتم مسح البيانات الحالية واستبدالها بالكامل بمحتوى النسخة الاحتياطية المؤرخة ${pendingBackup?.createdAt.slice(0, 10) ?? ''}. لا يمكن التراجع عن ذلك. لا تتابع إلا إذا كنت متأكداً أن هذه هي النسخة الصحيحة.`}
        confirmLabel="استبدال كل البيانات"
        cancelLabel="إلغاء"
        destructive
        onConfirm={() => void confirmRestore()}
        onCancel={() => setPendingBackup(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
    writingDirection: 'rtl',
  },
  errorBox: {
    gap: theme.spacingScale.xs,
    padding: theme.spacingScale.sm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.dangerBackground,
  },
  detailsToggle: { alignSelf: 'flex-start', minHeight: theme.sizes.touchCompact, justifyContent: 'center' },
  detailsLabel: { color: theme.colors.primary, fontSize: theme.typography.body, fontFamily: theme.typography.bold },
  errorDetail: { color: theme.colors.text, fontSize: theme.typography.small, writingDirection: 'ltr' },
  success: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
});
