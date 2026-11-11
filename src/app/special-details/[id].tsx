import { formatDate } from '@/utils/format';
import { AppText } from '@/components/ui/AppText';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listExpenses, type Expense } from '@/db/expenses';
import { getDatabase, markDirty } from '@/db/schema';
import {
  getSpecialApartmentSummaries,
  listSpecialCollectionSummaries,
  updateSpecialApartmentAmount,
  type SpecialApartmentSummary,
  type SpecialCollectionSummary,
} from '@/services/specialCollections';
import { recordSpecialPayment } from '@/services/billing';
import { arabicErrorMessage } from '@/services/errors';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { FilterBar, type FilterStatus } from '@/components/ui/FilterBar';
import { MoneyText, formatMoney } from '@/components/ui/MoneyText';
import { Screen } from '@/components/ui/Screen';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { Section } from '@/components/ui/Section';
import { StatusChip } from '@/components/ui/StatusChip';
import { theme } from '@/components/ui/theme';

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function SpecialDetailsScreen() {
  const router = useRouter();
  const { id, payApartmentId } = useLocalSearchParams<{ id: string; payApartmentId?: string }>();
  const specialId = Number(id);
  const [collection, setCollection] = useState<SpecialCollectionSummary | null>(null);
  const [apartments, setApartments] = useState<SpecialApartmentSummary[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sort, setSort] = useState('apartment');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<SpecialApartmentSummary | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(localToday());
  const [paymentNote, setPaymentNote] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [editTarget, setEditTarget] = useState<SpecialApartmentSummary | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [confirmEditVisible, setConfirmEditVisible] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!Number.isInteger(specialId) || specialId < 1) throw new Error('معرّف التحصيل غير صحيح.');
      const [allCollections, rows, allExpenses] = await Promise.all([
        listSpecialCollectionSummaries(true),
        getSpecialApartmentSummaries(specialId),
        listExpenses(),
      ]);
      const found = allCollections.find((item) => item.id === specialId);
      if (!found) throw new Error('التحصيل الخاص غير موجود.');
      setCollection(found);
      setApartments(rows);
      setExpenses(allExpenses.filter((expense) => expense.special_id === specialId));
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل تفاصيل التحصيل الخاص.'));
    } finally {
      setLoading(false);
    }
  }, [specialId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const openPayment = useCallback((apartment: SpecialApartmentSummary) => {
    setPaymentTarget(apartment);
    setPaymentAmount(apartment.remaining > 0 ? String(apartment.remaining) : '');
    setPaymentDate(localToday());
    setPaymentNote('');
    setError(null);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!payApartmentId || loading) return;
    const target = apartments.find((apartment) => apartment.apartmentId === Number(payApartmentId));
    if (target) openPayment(target);
    router.setParams({ payApartmentId: undefined });
  }, [apartments, loading, openPayment, payApartmentId, router]));

  const savePayment = async () => {
    if (!paymentTarget) return;
    const parsedAmount = Number(paymentAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('اكتب مبلغاً أكبر من صفر.');
      return;
    }
    if (parsedAmount > paymentTarget.remaining) {
      setError(`المبلغ أكبر من المتبقي (${formatMoney(paymentTarget.remaining)}).`);
      return;
    }
    setSavingPayment(true);
    setError(null);
    try {
      await recordSpecialPayment(
        paymentTarget.apartmentId,
        specialId,
        parsedAmount,
        paymentDate,
        paymentNote.trim(),
      );
      setPaymentTarget(null);
      setSuccess(`تم تسجيل ${formatMoney(parsedAmount)} من شقة ${paymentTarget.apartmentNumber}.`);
      await load();
    } catch (paymentError) {
      setError(arabicErrorMessage(paymentError, 'تعذر تسجيل الدفعة.'));
    } finally {
      setSavingPayment(false);
    }
  };

  const requestEditAmount = (apartment: SpecialApartmentSummary) => {
    setEditTarget(apartment);
    setEditAmount(String(apartment.due));
  };

  const saveApartmentAmount = async (confirmed = false) => {
    if (!editTarget) return;
    const parsedAmount = Number(editAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('اكتب مبلغاً صحيحاً.');
      return;
    }
    if (!confirmed) {
      setConfirmEditVisible(true);
      return;
    }
    try {
      await updateSpecialApartmentAmount(editTarget.chargeId, parsedAmount);
      setConfirmEditVisible(false);
      setEditTarget(null);
      setSuccess(`تم تعديل المبلغ المطلوب من شقة ${editTarget.apartmentNumber}.`);
      await load();
    } catch (updateError) {
      setConfirmEditVisible(false);
      setError(arabicErrorMessage(updateError, 'تعذر تعديل المبلغ المطلوب.'));
    }
  };

  const closeCollection = async () => {
    try {
      const db = await getDatabase();
      await db.runAsync('UPDATE special_collections SET active = 0 WHERE id = ?', specialId);
      await markDirty(db);
      setPendingClose(false);
      router.replace('/specials');
    } catch (closeError) {
      setError(arabicErrorMessage(closeError, 'تعذر إغلاق التحصيل.'));
      setPendingClose(false);
    }
  };

  const visibleApartments = unpaidOnly
    ? apartments.filter((apartment) => apartment.status !== 'paid')
    : apartments;
  const filteredApartments = visibleApartments
    .filter((apartment) => statusFilter === 'all' || apartment.status === statusFilter)
    .filter((apartment) => `${apartment.apartmentNumber} ${apartment.ownerName}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === 'remaining'
      ? b.remaining - a.remaining
      : a.apartmentNumber.localeCompare(b.apartmentNumber, undefined, { numeric: true }));

  return (
    <Screen>
      <BackButton onPress={() => router.back()} label="رجوع" />
      {collection ? (
          <>
            <ScreenTitle title={collection.title} subtitle={`تاريخ التحصيل: ${formatDate(collection.date)}`} />
            <View style={styles.summaryRow}>
              <Card variant="surface" style={styles.summaryCard}>
                <AppText style={styles.label}>المطلوب</AppText>
                <MoneyText amount={collection.totalTarget} size={theme.typography.section} />
              </Card>
              <Card variant="surface" style={styles.summaryCard}>
                <AppText style={styles.label}>المحصل</AppText>
                <MoneyText amount={collection.totalCollected} size={theme.typography.section} />
              </Card>
            </View>
            <Card variant="surface" style={styles.fundCard}>
              <AppText style={styles.label}>المتبقي من الصندوق (المحصل − المصروفات المرتبطة)</AppText>
              <MoneyText amount={collection.totalCollected - collection.linkedExpenses} />
              <AppText style={styles.helper}>مصروفات مرتبطة: {formatMoney(collection.linkedExpenses)}</AppText>
            </Card>
            {collection.note ? <AppText style={styles.helper}>{collection.note}</AppText> : null}
          </>
        ) : null}

      <Section title="الشقق">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchLabel="بحث برقم الشقة أو اسم المالك"
          searchPlaceholder="اكتب رقم الشقة أو الاسم"
          status={statusFilter}
          onStatusChange={setStatusFilter}
          sort={sort}
          sortOptions={[
            { value: 'apartment', label: 'رقم الشقة' },
            { value: 'remaining', label: 'أكبر متبقي' },
          ]}
          defaultSort="apartment"
          onSortChange={setSort}
          extraFilterCount={Number(unpaidOnly)}
          extraFilters={
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: unpaidOnly }}
              onPress={() => setUnpaidOnly((value) => !value)}
              style={[styles.switch, unpaidOnly && styles.switchOn]}>
              <AppText style={[styles.switchText, unpaidOnly && styles.switchTextOn]}>اللي لم يدفعوا فقط</AppText>
            </Pressable>
          }
          resultCount={filteredApartments.length}
          totalCount={apartments.length}
          totalAmount={filteredApartments.reduce((sum, apartment) => sum + apartment.remaining, 0)}
          onClear={() => { setSearch(''); setStatusFilter('all'); setSort('apartment'); setUnpaidOnly(false); }}
        />
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        {success ? <AppText style={styles.success}>{success}</AppText> : null}
        {loading ? <AppText style={styles.message}>جارٍ تحميل التفاصيل...</AppText> : null}
        {!loading && filteredApartments.length === 0 ? (
          <EmptyState message={unpaidOnly ? 'كل الشقق سددت هذا التحصيل.' : 'لا توجد رسوم مسجلة لهذا التحصيل.'} />
        ) : null}
        {filteredApartments.map((apartment) => {
          return (
            <Card key={apartment.chargeId}>
              <Pressable
                onPress={() => router.push({
                  pathname: '/apartment-account/[id]',
                  params: { id: String(apartment.apartmentId) },
                })}
                style={styles.apartmentRow}>
                <View style={styles.apartmentDetails}>
                  <AppText style={styles.apartmentTitle}>شقة {apartment.apartmentNumber}</AppText>
                  {apartment.ownerName ? <AppText style={styles.helper}>{apartment.ownerName}</AppText> : null}
                  <StatusChip status={apartment.status} />
                </View>
                <View style={styles.amountDetails}>
                  <AppText style={styles.helper}>المتبقي</AppText>
                  <MoneyText amount={apartment.remaining} size={theme.typography.section} />
                </View>
              </Pressable>
              <View style={styles.editRow}>
                <AppText style={styles.helper}>المطلوب: {formatMoney(apartment.due)}</AppText>
                <View style={styles.rowActions}>
                  {apartment.remaining > 0 ? (
                    <Pressable onPress={() => openPayment(apartment)} style={styles.smallButton}>
                      <AppText style={styles.editText}>دفع</AppText>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => requestEditAmount(apartment)} style={styles.smallButton}>
                    <AppText style={styles.editText}>تعديل المبلغ</AppText>
                  </Pressable>
                </View>
              </View>
            </Card>
          );
        })}
      </Section>

      <Section title="المصروفات المرتبطة">
        {!loading && expenses.length === 0 ? (
          <EmptyState message="لا توجد مصروفات مرتبطة بهذا التحصيل." />
        ) : null}
        {expenses.map((expense) => (
          <Card key={expense.id}>
            <View style={styles.expenseRow}>
              <View style={styles.expenseDetails}>
                <AppText style={styles.apartmentTitle}>{formatDate(expense.expense_date)}</AppText>
                {expense.note ? <AppText style={styles.helper}>{expense.note}</AppText> : null}
              </View>
              <MoneyText amount={expense.amount} size={theme.typography.section} />
            </View>
          </Card>
        ))}
      </Section>
      {collection?.active ? (
        <BigButton title="إغلاق التحصيل" variant="secondary" onPress={() => setPendingClose(true)} />
      ) : null}

      <AppBottomSheet
        visible={editTarget !== null}
        title="تعديل المبلغ المطلوب"
        snapPoints={['55%']}
        onClose={() => setEditTarget(null)}>
        <AppText style={styles.helper}>
          المبلغ الحالي لشقة {editTarget?.apartmentNumber}: {formatMoney(editTarget?.due ?? 0)}
        </AppText>
        <FormField label="المبلغ الجديد" value={editAmount} onChangeText={setEditAmount} keyboardType="decimal-pad" />
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        <BigButton title="حفظ التعديل" onPress={() => void saveApartmentAmount()} />
        <BigButton
          title="إلغاء"
          variant="secondary"
          onPress={() => setEditTarget(null)}
        />
      </AppBottomSheet>
      <AppBottomSheet
        visible={paymentTarget !== null}
        title={paymentTarget ? `تسجيل دفعة لشقة ${paymentTarget.apartmentNumber}` : 'تسجيل دفعة'}
        snapPoints={['70%', '90%']}
        onClose={() => setPaymentTarget(null)}>
        {paymentTarget ? (
          <>
            <AppText style={styles.helper}>المتبقي: {formatMoney(paymentTarget.remaining)}</AppText>
            <FormField label="المبلغ" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="decimal-pad" />
            <FormField label="تاريخ الدفع" value={paymentDate} onChangeText={setPaymentDate} />
            <FormField label="ملاحظة (اختياري)" value={paymentNote} onChangeText={setPaymentNote} />
            {error ? <AppText style={styles.error}>{error}</AppText> : null}
            <BigButton
              title="تسجيل الدفعة"
              loading={savingPayment}
              onPress={() => void savePayment()}
            />
            <BigButton
              title="إلغاء"
              variant="secondary"
              disabled={savingPayment}
              onPress={() => setPaymentTarget(null)}
            />
          </>
        ) : null}
      </AppBottomSheet>
      <ConfirmDialog
        visible={confirmEditVisible}
        title="تأكيد تعديل المبلغ"
        message={`هل تريد تغيير المبلغ المطلوب من شقة ${editTarget?.apartmentNumber ?? ''} إلى ${formatMoney(Number(editAmount) || 0)}؟`}
        confirmLabel="نعم، احفظ"
        onConfirm={() => void saveApartmentAmount(true)}
        onCancel={() => setConfirmEditVisible(false)}
      />
      <ConfirmDialog
        visible={pendingClose}
        title="إغلاق التحصيل"
        message={`هل تريد إغلاق «${collection?.title ?? ''}»؟ سيختفي من القائمة النشطة وتبقى بياناته محفوظة.`}
        confirmLabel="نعم، أغلقه"
        onConfirm={() => void closeCollection()}
        onCancel={() => setPendingClose(false)}
      />
    </Screen>
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
  summaryRow: {
    flexDirection: 'row',
    gap: theme.spacingScale.cardGap,
  },
  summaryCard: {
    flex: 1,
  },
  fundCard: {
    alignItems: 'flex-end',
  },
  label: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  helper: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  switchRow: {
    minHeight: theme.sizes.touchCompact + theme.spacingScale.xs / 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  switch: {
    minWidth: theme.sizes.minActionWidth,
    minHeight: theme.sizes.touchCompact,
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  switchOn: {
    backgroundColor: theme.colors.primary,
  },
  switchText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  switchTextOn: {
    color: theme.colors.surface,
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
  apartmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacingScale.xs,
  },
  apartmentDetails: {
    flex: 1,
    alignItems: 'flex-end',
    gap: theme.spacingScale.xs,
  },
  apartmentTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
  },
  chip: {
    paddingHorizontal: theme.spacingScale.xs,
    paddingVertical: theme.spacingScale.xs,
    borderRadius: theme.radii.sm,
  },
  chipText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  amountDetails: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: theme.spacingScale.xs,
  },
  editRow: {
    marginTop: theme.spacingScale.xs,
    paddingTop: theme.spacingScale.xs,
    borderTopColor: theme.colors.border,
    borderTopWidth: theme.borderWidths.hairline,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowActions: { flexDirection: 'row', gap: theme.spacingScale.xs },
  smallButton: {
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
    paddingHorizontal: theme.spacingScale.xs,
  },
  editText: {
    color: theme.colors.primary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expenseDetails: {
    flex: 1,
    alignItems: 'flex-end',
  },
});
