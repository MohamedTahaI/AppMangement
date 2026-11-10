import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSetting } from '@/db/settings';
import { getDatabase, markDirty } from '@/db/schema';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { theme } from '@/components/ui/theme';
import {
  getSyncStatus,
  pingSheet,
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
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);

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
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات الاتصال.');
    });
  }, [load]));

  useFocusEffect(useCallback(() => {
    return subscribeToSyncStatus(() => {
      void getSyncStatus().then(setStatus).catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل حالة التحديث.');
      });
    });
  }, []));

  const saveConfiguration = async (): Promise<void> => {
    const normalizedUrl = url.trim();
    const normalizedSecret = secret.trim();
    if (!normalizedUrl || !normalizedSecret) {
      throw new Error('أدخل رابط الجدول والرمز السري.');
    }
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(normalizedUrl)) {
      throw new Error('الرابط يجب أن يكون رابط تطبيق الويب المنشور وينتهي بـ /exec.');
    }
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
    setError(null);
    setNotice(null);
    try {
      await saveConfiguration();
      await pingSheet();
      setNotice('نجح الاتصال بالجدول.');
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'تعذر اختبار الاتصال.');
    } finally {
      setBusy(false);
      void getSyncStatus().then(setStatus);
    }
  };

  const updateSheet = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await saveConfiguration();
      await syncNow();
      setNotice('تم تحديث الجدول بالكامل بنجاح.');
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'تعذر تحديث الجدول.');
    } finally {
      setBusy(false);
      void getSyncStatus().then(setStatus);
    }
  };

  const rebuildSheet = async () => {
    setConfirmRebuild(false);
    await updateSheet();
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
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle title="الجدول الأونلاين" subtitle="نسخة للقراءة فقط على جدول جوجل" />

        <Card variant="surface" style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <Text style={styles.statusText}>{statusLabel(status)}</Text>
          </View>
          <Text style={styles.lastSync}>آخر تحديث: {formatSyncDate(status.lastSyncedAt)}</Text>
          {status.error ? <Text style={styles.error}>{status.error}</Text> : null}
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
        <Text style={styles.help}>
          احفظ الرابط والرمز من محرر السكريبت. لا تشارك الرمز مع السكان.
        </Text>

        <BigButton
          title={busy ? 'جارٍ الاتصال...' : 'حفظ بيانات الاتصال'}
          onPress={() => {
            setBusy(true);
            setError(null);
            setNotice(null);
            void saveConfiguration()
              .then(() => setNotice('تم حفظ بيانات الاتصال.'))
              .catch((saveError: unknown) => {
                setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ بيانات الاتصال.');
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

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <Text style={styles.help}>
          يُرسل التطبيق نسخة كاملة من البيانات ويعيد كتابة أوراق الجدول. السكان يستطيعون المشاهدة فقط.
        </Text>
      </ScrollView>

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
    </>
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
  lastSync: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
  help: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    lineHeight: theme.typography.lineHeightBody,
    textAlign: 'right',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
  notice: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
});
