import { AppText } from '@/components/ui/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getSetting } from '@/db/settings';
import { getDatabase, markDirty } from '@/db/schema';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { Toast } from '@/components/ui/Toast';
import { theme } from '@/components/ui/theme';
import { arabicErrorMessage } from '@/services/errors';
import { checkSheetUrl } from '@/services/sheetUrl';
import {
  getSyncStatus,
  pingMessage,
  pingSheet,
  SheetError,
  sheetErrorDetails,
  subscribeToSyncStatus,
  syncNow,
  type SyncStatus,
} from '@/services/sync';

function statusLabel(status: SyncStatus): string {
  if (status.state === 'unbound') return 'غير مربوط';
  if (status.state === 'failed') return 'فشل';
  return status.state === 'waiting' ? 'في انتظار التحديث' : 'متزامن';
}

function formatSyncDate(value: string | null): string {
  if (!value) return 'لم يحدث تحديث بعد';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'لم يحدث تحديث بعد';
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OnlineSheetScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<SyncStatus>({
    state: 'unbound',
    lastSyncedAt: null,
    error: null,
    pendingCount: 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);

  const clearError = useCallback(() => {
    setError(null);
    setErrorDetails(null);
    setShowDetails(false);
  }, []);

  const fail = useCallback((message: string, details: string | null) => {
    setError(message);
    setErrorDetails(details);
    setShowDetails(false);
  }, []);

  const load = useCallback(async () => {
    const [savedUrl, savedSecret, syncStatus] = await Promise.all([
      getSetting('sheet_url'),
      getSetting('sheet_secret'),
      getSyncStatus(),
    ]);
    setUrl(savedUrl ?? '');
    setSecret(savedSecret ?? '');
    setStatus(syncStatus);
  }, []);

  useFocusEffect(useCallback(() => {
    void load().catch((loadError: unknown) => {
      fail(arabicErrorMessage(loadError, 'تعذر تحميل بيانات الاتصال.'), sheetErrorDetails(loadError));
    });
  }, [load, fail]));

  useFocusEffect(useCallback(() => {
    return subscribeToSyncStatus(() => {
      void getSyncStatus().then(setStatus).catch((loadError: unknown) => {
        fail(arabicErrorMessage(loadError, 'تعذر تحميل حالة التحديث.'), sheetErrorDetails(loadError));
      });
    });
  }, [fail]));

  const saveConfiguration = async (): Promise<void> => {
    const normalizedSecret = secret.trim();
    if (!url.trim() || !normalizedSecret) {
      throw new SheetError('أدخل رابط الجدول والرمز السري.');
    }
    const checked = checkSheetUrl(url);
    if (!checked.ok) {
      throw new SheetError(checked.error);
    }
    const normalizedUrl = checked.url;
    setUrl(normalizedUrl);
    const [savedUrl, savedSecret] = await Promise.all([
      getSetting('sheet_url'),
      getSetting('sheet_secret'),
    ]);
    if (savedUrl === normalizedUrl && savedSecret === normalizedSecret) return;
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES ('sheet_url', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        normalizedUrl,
      );
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES ('sheet_secret', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        normalizedSecret,
      );
      await db.runAsync('DELETE FROM sync_state');
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES ('sheet_revision', '')
         ON CONFLICT(key) DO UPDATE SET value = ''`,
      );
      await markDirty(db);
    });
  };

  const testConnection = async () => {
    setBusy(true);
    clearError();
    setNotice(null);
    try {
      await saveConfiguration();
      const ping = await pingSheet();
      const message = pingMessage(ping);
      setNotice(message);
      setToastMessage(message);
    } catch (testError) {
      fail(arabicErrorMessage(testError, 'تعذر اختبار الاتصال.'), sheetErrorDetails(testError));
    } finally {
      setBusy(false);
      void getSyncStatus().then(setStatus);
    }
  };

  const updateSheet = async () => {
    setBusy(true);
    clearError();
    setNotice(null);
    try {
      await saveConfiguration();
      const result = await syncNow();
      const message = result.sent > 0 ? `تم إرسال ${result.sent} تغيير.` : 'لا توجد تغييرات جديدة للإرسال.';
      setNotice(message);
      setToastMessage(message);
    } catch (syncError) {
      fail(arabicErrorMessage(syncError, 'تعذر تحديث الجدول.'), sheetErrorDetails(syncError));
    } finally {
      setBusy(false);
      void getSyncStatus().then(setStatus);
    }
  };

  const rebuildSheet = async () => {
    setConfirmRebuild(false);
    setBusy(true);
    clearError();
    setNotice(null);
    try {
      await saveConfiguration();
      const result = await syncNow({ full: true });
      setNotice(`تمت إعادة بناء الجدول بالكامل (${result.sent} صف).`);
    } catch (syncError) {
      fail(arabicErrorMessage(syncError, 'تعذر تحديث الجدول.'), sheetErrorDetails(syncError));
    } finally {
      setBusy(false);
      void getSyncStatus().then(setStatus);
    }
  };

  const dotColor =
    status.state === 'unbound'
      ? theme.colors.muted
      : status.state === 'failed'
      ? theme.colors.danger
      : status.state === 'waiting'
        ? theme.colors.warning
        : theme.colors.success;

  return (
    <>
      <Screen>
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle title="الجدول الأونلاين" subtitle="نسخة للقراءة فقط على جدول جوجل" />

        <Card variant="surface" style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <AppText style={styles.statusText}>{statusLabel(status)}</AppText>
          </View>
          <AppText style={styles.lastSync}>آخر تحديث: {formatSyncDate(status.lastSyncedAt)}</AppText>
          {status.pendingCount > 0 ? (
            <AppText style={styles.pending}>{status.pendingCount} تغيير في انتظار الإرسال</AppText>
          ) : null}
          {status.error ? <AppText style={styles.error}>{status.error}</AppText> : null}
        </Card>

        <FormField
          label="رابط تطبيق الويب"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="الصق رابط الجدول هنا"
          editable={!busy}
        />
        <FormField
          label="الرمز السري"
          value={secret}
          onChangeText={setSecret}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={!busy}
        />
        <AppText style={styles.help}>
          احفظ الرابط والرمز من محرر السكريبت. لا تشارك الرمز مع السكان.
        </AppText>

        <BigButton
          title={busy ? 'جارٍ الاتصال...' : 'حفظ بيانات الاتصال'}
          onPress={() => {
            setBusy(true);
            clearError();
            setNotice(null);
            void saveConfiguration()
              .then(() => setNotice('تم حفظ بيانات الاتصال.'))
              .catch((saveError: unknown) => {
                fail(
                  arabicErrorMessage(saveError, 'تعذر حفظ بيانات الاتصال.'),
                  sheetErrorDetails(saveError),
                );
              })
              .finally(() => setBusy(false));
          }}
          disabled={busy}
        />
        <BigButton
          title={busy ? 'جارٍ الاختبار...' : 'اختبار الاتصال'}
          variant="secondary"
          onPress={() => void testConnection()}
          disabled={busy}
        />
        <BigButton
          title={busy ? 'جارٍ التحديث...' : 'تحديث الجدول الآن'}
          onPress={() => void updateSheet()}
          disabled={busy}
        />
        <BigButton
          title="إعادة بناء الجدول بالكامل"
          variant="danger"
          onPress={() => setConfirmRebuild(true)}
          disabled={busy}
        />

        {error ? (
          <View style={styles.errorBlock}>
            <AppText style={styles.error}>{error}</AppText>
            {errorDetails ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowDetails((value) => !value)}
                style={styles.detailsToggle}
              >
                <AppText style={styles.detailsLink}>
                  {showDetails ? 'إخفاء التفاصيل ▲' : 'تفاصيل ▼'}
                </AppText>
              </Pressable>
            ) : null}
            {errorDetails && showDetails ? (
              <AppText style={styles.details}>{errorDetails}</AppText>
            ) : null}
          </View>
        ) : null}
        {notice ? <AppText style={styles.notice}>{notice}</AppText> : null}
        <AppText style={styles.help}>
          يُرسل التطبيق نسخة كاملة من البيانات ويعيد كتابة أوراق الجدول. السكان يستطيعون المشاهدة فقط.
        </AppText>
      </Screen>

      <ConfirmDialog
        visible={confirmRebuild}
        title="إعادة بناء الجدول بالكامل؟"
        message="سيتم استبدال محتوى أوراق التطبيق في الجدول بنسخة البيانات الموجودة على هذا الهاتف. استخدم هذا الخيار عند الانتقال إلى جدول جديد. لا يمكن التراجع عن محتوى الجدول السابق."
        confirmLabel="نعم، أعد البناء"
        cancelLabel="إلغاء"
        destructive
        onConfirm={() => void rebuildSheet()}
        onCancel={() => setConfirmRebuild(false)}
      />
      <Toast
        visible={toastMessage !== null}
        message={toastMessage ?? ''}
        variant="success"
        onDismiss={() => setToastMessage(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  back: {
    minHeight: theme.sizes.touchCompact,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  backText: {
    color: theme.colors.primary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  statusCard: {
    gap: theme.spacingScale.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacingScale.xs,
  },
  dot: {
    width: theme.sizes.statusDot,
    height: theme.sizes.statusDot,
    borderRadius: theme.radii.sm,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.extraBold,
  },
  pending: {
    color: theme.colors.warning,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  lastSync: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  help: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    lineHeight: theme.typography.lineHeightBody,
    textAlign: 'auto',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  errorBlock: {
    gap: theme.spacingScale.xs,
  },
  detailsToggle: {
    alignSelf: 'flex-start',
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
  },
  detailsLink: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.small,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  details: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.small,
    fontFamily: theme.typography.fontFamily,
    lineHeight: theme.typography.lineHeightBody,
    textAlign: 'auto',
  },
  notice: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
});
