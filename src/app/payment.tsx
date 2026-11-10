import { SectionHeader } from '@/components/ui/SectionHeader';
import { formatDate } from '@/services/dateFormat';
import { AppText } from '@/components/ui/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { listApartmentPayments, softDeletePayment, type ApartmentPayment } from '@/db/payments';
import { listApartments, type Apartment } from '@/db/apartments';
import {
  getApartmentYearPreviews,
  recordPayment,
  type ApartmentMonthPreview,
} from '@/services/billing';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { formatMoney, MoneyText } from '@/components/ui/MoneyText';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { theme } from '@/components/ui/theme';
import { getMonthLabel } from '@/components/ui/MonthPicker';
import { arabicErrorMessage } from '@/services/errors';

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthStatus(status: ApartmentMonthPreview['status']): string {
  if (status === 'paid') return 'مدفوع';
  if (status === 'partial') return 'جزئي';
  return 'لم يدفع';
}

export default function PaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ apartmentId?: string; month?: string }>();
  const apartmentId = Number(params.apartmentId);
  const initialMonth = params.month ?? localToday().slice(0, 7);
  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [year, setYear] = useState(Number(initialMonth.slice(0, 4)));
  const currentYear = new Date().getFullYear();
  const [months, setMonths] = useState<ApartmentMonthPreview[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([initialMonth]);
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(localToday());
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<ApartmentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApartmentPayment | null>(null);

  const load = async (clearSelection = false) => {
    setLoading(true);
    setError(null);
    try {
      if (!Number.isInteger(apartmentId) || apartmentId < 1) {
        throw new Error('رقم الشقة غير صحيح.');
      }
      const apartments = await listApartments(true);
      setApartment(apartments.find((item) => item.id === apartmentId) ?? null);
      const [previews, payments] = await Promise.all([
        getApartmentYearPreviews(apartmentId, year),
        listApartmentPayments(apartmentId),
      ]);
      setMonths(previews);
      setHistory(payments);
      const validSelections = clearSelection
        ? []
        : selectedMonths.filter((month) =>
            previews.some((preview) => preview.month === month),
          );
      const selectionChanged = clearSelection || validSelections.length !== selectedMonths.length;
      if (selectionChanged) setSelectedMonths(validSelections);
      if (selectionChanged || amount === '') {
        const total = previews
          .filter((preview) => validSelections.includes(preview.month))
          .reduce((sum, preview) => sum + preview.remaining, 0);
        setAmount(total === 0 ? '' : String(total));
      }
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل بيانات الدفع. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // This async load is keyed by route apartment/year; changing a checked month must not reload the form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartmentId, year]);

  const selectedBalance = useMemo(
    () =>
      months
        .filter((preview) => selectedMonths.includes(preview.month))
        .reduce((total, preview) => total + preview.remaining, 0),
    [months, selectedMonths],
  );

  const toggleMonth = (month: string) => {
    setSuccess(null);
    setSelectedMonths((current) => {
      const next = current.includes(month)
        ? current.filter((value) => value !== month)
        : [...current, month];
      const nextTotal = months
        .filter((preview) => next.includes(preview.month))
        .reduce((total, preview) => total + preview.remaining, 0);
      setAmount(nextTotal === 0 ? '' : String(nextTotal));
      return next;
    });
  };

  const changeYear = (delta: number) => {
    const nextYear = year + delta;
    if (nextYear < 1 || nextYear > 9999) return;
    setSelectedMonths([]);
    setAmount('');
    setYear(nextYear);
  };

  const save = async () => {
    const paymentAmount = Number(amount);
    if (selectedMonths.length === 0) {
      setError('اختر شهراً واحداً على الأقل.');
      return;
    }
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setError('اكتب مبلغاً أكبر من صفر.');
      return;
    }
    if (paymentAmount > selectedBalance) {
      setError(`المبلغ أكبر من المتبقي المحدد (${formatMoney(selectedBalance)}).`);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const allocations = await recordPayment(
        apartmentId,
        selectedMonths,
        paymentAmount,
        paidDate,
        note.trim(),
      );
      const monthsLabel = allocations.map((item) => getMonthLabel(item.month)).join('، ');
      setSuccess(`تم تسجيل ${formatMoney(paymentAmount)} عن ${monthsLabel}.`);
      setSelectedMonths([]);
      setAmount('');
      setNote('');
      await load(true);
    } catch (saveError) {
      setError(arabicErrorMessage(saveError, 'تعذر تسجيل الدفعة. تحقق من المبلغ والشهور المحددة.'));
    } finally {
      setSaving(false);
    }
  };

  const deletePayment = async () => {
    if (!pendingDelete) return;
    try {
      await softDeletePayment(pendingDelete.id);
      setPendingDelete(null);
      setSuccess('تم حذف الدفعة من السجل.');
      await load();
    } catch (deleteError) {
      setError(arabicErrorMessage(deleteError, 'تعذر حذف الدفعة. حاول مرة أخرى.'));
      setPendingDelete(null);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle
          title="تسجيل دفعة"
          subtitle={apartment ? `شقة ${apartment.number}${apartment.owner_name ? ` - ${apartment.owner_name}` : ''}` : ''}
        />
        <Card style={styles.yearCard}>
          <Pressable accessibilityRole="button" accessibilityLabel="السنة السابقة" onPress={() => changeYear(-1)} style={styles.yearArrow}>
            <MaterialIcons name="chevron-right" size={theme.sizes.iconLarge} color={theme.colors.primary} />
          </Pressable>
          <AppText style={styles.yearText}>{year}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="السنة التالية"
            accessibilityState={{ disabled: year >= currentYear }}
            disabled={year >= currentYear}
            onPress={() => changeYear(1)}
            style={[styles.yearArrow, year >= currentYear && styles.yearArrowDisabled]}>
            <MaterialIcons name="chevron-left" size={theme.sizes.iconLarge} color={year >= currentYear ? theme.colors.muted : theme.colors.primary} />
          </Pressable>
        </Card>
        <SectionHeader title="اختر شهراً أو أكثر" />
        {loading ? <AppText style={styles.message}>جارٍ تحميل الشهور وسجل الدفعات...</AppText> : null}
        {!loading && months.length === 0 ? (
          <EmptyState message="لا توجد اشتراكات مسجلة لهذه الشقة في هذه السنة." />
        ) : null}
        {months.map((preview) => {
          const checked = selectedMonths.includes(preview.month);
          const statusColor =
            preview.status === 'paid'
              ? theme.colors.success
              : preview.status === 'partial'
                ? theme.colors.warning
                : theme.colors.danger;
          return (
            <Pressable
              key={preview.month}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => toggleMonth(preview.month)}>
              <Card style={checked ? styles.selectedMonth : undefined}>
                <View style={styles.monthLine}>
                  <View style={[styles.checkbox, checked && styles.checked]}>
                    {checked ? <MaterialIcons name="check" size={theme.sizes.icon} color={theme.colors.onPrimary} /> : null}
                  </View>
                  <View style={styles.monthDetails}>
                    <AppText style={styles.monthName}>{getMonthLabel(preview.month)}</AppText>
                    <AppText style={[styles.monthStatus, { color: statusColor }]}>
                      {monthStatus(preview.status)}
                    </AppText>
                  </View>
                  <MoneyText amount={preview.remaining} size={theme.typography.section} />
                </View>
              </Card>
            </Pressable>
          );
        })}
        <SectionHeader title="بيانات الدفع" />
        <FormField
          label="المبلغ"
          value={amount}
          onChangeText={(value) => {
            setAmount(value);
            setSuccess(null);
          }}
          keyboardType="decimal-pad"
          placeholder="يُحسب من الشهور المحددة"
        />
        <AppText style={styles.helper}>المتبقي للشهور المحددة: {formatMoney(selectedBalance)}</AppText>
        <FormField
          label="تاريخ الدفع"
          value={paidDate}
          onChangeText={setPaidDate}
          placeholder="مثال: 2026-01-31"
        />
        <FormField
          label="ملاحظة (اختياري)"
          value={note}
          onChangeText={setNote}
          placeholder="اكتب ملاحظة"
        />
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        {success ? <AppText style={styles.success}>{success}</AppText> : null}
        <BigButton
          title={saving ? 'جارٍ تسجيل الدفع...' : 'تسجيل الدفع'}
          onPress={() => void save()}
          disabled={saving || loading}
        />
        <SectionHeader title="سجل الدفعات" />
        {history.length === 0 ? <EmptyState message="لا توجد دفعات مسجلة لهذه الشقة." /> : null}
        {history.map((payment) => (
          <Card key={payment.id}>
            <View style={styles.historyRow}>
              <View style={styles.historyDetails}>
                <AppText style={styles.monthName}>
                  {payment.type === 'monthly'
                    ? getMonthLabel(payment.month ?? '')
                    : payment.special_title ?? 'تحصيل خاص'}
                </AppText>
                <AppText style={styles.helper}>{formatDate(payment.paid_date)}</AppText>
                {payment.note ? <AppText style={styles.helper}>{payment.note}</AppText> : null}
              </View>
              <MoneyText amount={payment.amount} size={theme.typography.section} />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPendingDelete(payment)}
              style={styles.deleteButton}>
              <AppText style={styles.deleteText}>حذف الدفعة</AppText>
            </Pressable>
          </Card>
        ))}
      </ScrollView>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="حذف الدفعة"
        message={`هل تريد حذف دفعة ${formatMoney(pendingDelete?.amount ?? 0)}؟ ستُزال من الحسابات.`}
        confirmLabel="نعم، احذفها"
        destructive
        onConfirm={() => void deletePayment()}
        onCancel={() => setPendingDelete(null)}
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
    alignSelf: 'flex-start',
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
  },
  backText: {
    color: theme.colors.primary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  yearCard: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  yearArrow: {
    minWidth: theme.sizes.avatar,
    minHeight: theme.sizes.touchCompact,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearArrowDisabled: { opacity: 0.55 },
  yearText: {
    color: theme.colors.text,
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.extraBold,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
  },
  message: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'center',
  },
  monthLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacingScale.xs,
  },
  monthDetails: {
    flex: 1,
    alignItems: 'flex-end',
    gap: theme.spacingScale.xs,
  },
  monthName: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  monthStatus: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  checkbox: {
    width: theme.sizes.checkbox,
    height: theme.sizes.checkbox,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borderWidths.strong,
    borderColor: theme.colors.primary,
    overflow: 'hidden',
  },
  checked: {
    backgroundColor: theme.colors.primary,
  },
  selectedMonth: {
    borderColor: theme.colors.primary,
    borderWidth: theme.borderWidths.strong,
  },
  helper: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  success: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacingScale.xs,
  },
  historyDetails: {
    flex: 1,
    gap: theme.spacingScale.xs,
    alignItems: 'flex-end',
  },
  deleteButton: {
    minHeight: theme.sizes.touchCompact,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  deleteText: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
});
