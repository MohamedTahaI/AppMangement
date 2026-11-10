import { AppText } from '@/components/ui/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { listFeeRates, setFeeRate } from '@/db/fees';
import { getFeeForMonth } from '@/services/billing';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { MonthPicker, getCurrentMonth, getMonthLabel } from '@/components/ui/MonthPicker';
import { MoneyText } from '@/components/ui/MoneyText';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { Skeleton } from '@/components/ui/Skeleton';
import { SuccessSheet } from '@/components/ui/SuccessSheet';
import { theme } from '@/components/ui/theme';
import { arabicErrorMessage } from '@/services/errors';

export default function FeeScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(getCurrentMonth());
  const [amount, setAmount] = useState('');
  const [currentFee, setCurrentFee] = useState<number | null>(null);
  const [existingMonthRate, setExistingMonthRate] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCurrentFee(await getFeeForMonth(getCurrentMonth()));
      const rates = await listFeeRates();
      const row = rates.find((rate) => rate.effective_from === month);
      setExistingMonthRate(row !== undefined);
      setAmount(row ? String(row.amount) : '');
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل قيمة الاشتراك. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const chooseMonth = (nextMonth: string) => {
    setMonth(nextMonth);
  };

  const openEditor = () => {
    setMonth(getCurrentMonth());
    setError(null);
    setEditorVisible(true);
  };

  const save = async (confirmed = false) => {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('اكتب قيمة اشتراك صحيحة.');
      return;
    }
    if (existingMonthRate && !confirmed) {
      setConfirmVisible(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setFeeRate(month, parsedAmount);
      setConfirmVisible(false);
      setEditorVisible(false);
      await load();
      setSuccessVisible(true);
    } catch (saveError) {
      setError(arabicErrorMessage(saveError, 'تعذر حفظ قيمة الاشتراك. تحقق من المبلغ والشهر.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle title="الفاتورة الشهرية" subtitle="تغيير قيمة الفاتورة من شهر محدد" />
        {loading ? <Skeleton height={theme.sizes.regularCardHeight} /> : null}
        {!loading && currentFee !== null ? (
          <Card variant="surface">
            <AppText style={styles.label}>الاشتراك الحالي لهذا الشهر</AppText>
            <MoneyText amount={currentFee} />
          </Card>
        ) : null}
        <BigButton
          title="تغيير الاشتراك"
          onPress={openEditor}
          disabled={loading || currentFee === null}
        />
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
      </ScrollView>

      <AppBottomSheet
        visible={editorVisible}
        title="تغيير الفاتورة الشهرية"
        snapPoints={['66%', '90%']}
        onClose={() => setEditorVisible(false)}>
        <AppText style={styles.label}>يبدأ الاشتراك الجديد من</AppText>
        <MonthPicker month={month} onChange={chooseMonth} />
        <FormField
          label="قيمة الاشتراك لكل شقة"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="مثال: 400"
        />
        {existingMonthRate ? (
          <AppText style={styles.warning}>يوجد اشتراك محفوظ لهذا الشهر. سيطلب التطبيق تأكيد تغييره.</AppText>
        ) : null}
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        <BigButton
          title="حفظ الاشتراك"
          loading={saving}
          disabled={loading}
          onPress={() => void save()}
        />
        <BigButton
          title="إلغاء"
          variant="secondary"
          disabled={saving}
          onPress={() => setEditorVisible(false)}
        />
      </AppBottomSheet>

      <ConfirmDialog
        visible={confirmVisible}
        title="تغيير الاشتراك"
        message={`يوجد مبلغ محفوظ من ${getMonthLabel(month)}. هل تريد استبداله بالمبلغ الجديد؟`}
        confirmLabel="نعم، غيّر المبلغ"
        confirmDisabled={saving}
        onConfirm={() => void save(true)}
        onCancel={() => setConfirmVisible(false)}
      />
      <SuccessSheet
        visible={successVisible}
        message={`تم حفظ الاشتراك ابتداءً من ${getMonthLabel(month)}.`}
        onDismiss={() => setSuccessVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: theme.spacingScale.screen,
    paddingTop: theme.spacingScale.md,
    gap: theme.spacingScale.sm,
    backgroundColor: theme.colors.background,
    writingDirection: 'rtl',
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  warning: {
    color: theme.colors.warning,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
});
