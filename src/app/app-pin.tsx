import { AppText } from '@/components/ui/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { theme } from '@/components/ui/theme';
import { disableAppPin, isAppPinEnabled, setAppPin, verifyAppPin } from '@/services/appPin';
import { arabicErrorMessage } from '@/services/errors';

export default function AppPinScreen() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [firstPin, setFirstPin] = useState('');
  const [secondPin, setSecondPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const load = useCallback(async () => {
    try {
      setEnabled(await isAppPinEnabled());
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل إعداد رمز الدخول.'));
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const enable = async () => {
    setError(null);
    setNotice(null);
    if (!/^\d{4}$/.test(firstPin)) {
      setError('اكتب رمزاً من 4 أرقام.');
      return;
    }
    if (firstPin !== secondPin) {
      setError('الرمزان غير متطابقين. أعد كتابتهما.');
      return;
    }
    setLoading(true);
    try {
      await setAppPin(firstPin);
      setFirstPin('');
      setSecondPin('');
      setEnabled(true);
      setNotice('تم تشغيل رمز الدخول. سيُطلب عند فتح التطبيق.');
    } catch (saveError) {
      setError(arabicErrorMessage(saveError, 'تعذر حفظ رمز الدخول.'));
    } finally {
      setLoading(false);
    }
  };

  const requestDisable = async () => {
    setError(null);
    if (!/^\d{4}$/.test(currentPin)) {
      setError('اكتب رمز الدخول الحالي المكوّن من 4 أرقام.');
      return;
    }
    setLoading(true);
    try {
      if (!(await verifyAppPin(currentPin))) {
        setError('رمز الدخول غير صحيح.');
        return;
      }
      setConfirmDisable(true);
    } catch (verifyError) {
      setError(arabicErrorMessage(verifyError, 'تعذر التحقق من رمز الدخول.'));
    } finally {
      setLoading(false);
    }
  };

  const confirmDisablePin = async () => {
    setConfirmDisable(false);
    setLoading(true);
    setError(null);
    try {
      await disableAppPin(currentPin);
      setCurrentPin('');
      setEnabled(false);
      setNotice('تم إيقاف رمز الدخول.');
    } catch (disableError) {
      setError(arabicErrorMessage(disableError, 'تعذر إيقاف رمز الدخول.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Screen>
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle title="رمز الدخول" subtitle="اختياري لحماية فتح التطبيق" />
        <AppText style={styles.status}>
          حالة الحماية: {enabled ? 'رمز الدخول يعمل' : 'رمز الدخول متوقف'}
        </AppText>

        {enabled ? (
          <>
            <FormField
              label="اكتب رمز الدخول الحالي لإيقافه"
              value={currentPin}
              onChangeText={(value) => setCurrentPin(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <BigButton
              title={loading ? 'جارٍ التحقق...' : 'إيقاف رمز الدخول'}
              variant="danger"
              onPress={() => void requestDisable()}
              disabled={loading}
            />
          </>
        ) : (
          <>
            <FormField
              label="رمز جديد من 4 أرقام"
              value={firstPin}
              onChangeText={(value) => setFirstPin(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <FormField
              label="أعد كتابة الرمز للتأكيد"
              value={secondPin}
              onChangeText={(value) => setSecondPin(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <BigButton
              title={loading ? 'جارٍ الحفظ...' : 'تشغيل رمز الدخول'}
              onPress={() => void enable()}
              disabled={loading}
            />
          </>
        )}

        <AppText style={styles.help}>لا تحفظ الشفرة نفسها؛ يُحفظ رمز مشفّر فقط. اختر رقماً يسهل تذكره.</AppText>
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        {notice ? <AppText style={styles.notice}>{notice}</AppText> : null}
      </Screen>

      <ConfirmDialog
        visible={confirmDisable}
        title="إيقاف رمز الدخول"
        message="هل تريد إيقاف طلب الرمز عند فتح التطبيق؟"
        confirmLabel="نعم، أوقفه"
        destructive
        onConfirm={() => void confirmDisablePin()}
        onCancel={() => setConfirmDisable(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  status: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.extraBold,
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
  notice: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
});
