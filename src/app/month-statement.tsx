import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listExpenseCategories, listExpenses, type Expense, type ExpenseCategory } from '@/db/expenses';
import { getDatabase } from '@/db/schema';
import { getDashboardTotals, getMonthlyApartmentRows, type MonthlyApartmentRow } from '@/services/billing';
import { listSpecialCollectionSummaries, type SpecialCollectionSummary } from '@/services/specialCollections';
import { MonthPicker, getCurrentMonth, getMonthLabel } from '@/components/ui/MonthPicker';
import { MonthTransition } from '@/components/ui/MonthTransition';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyText } from '@/components/ui/MoneyText';
import { Skeleton } from '@/components/ui/Skeleton';
import { arabicErrorMessage } from '@/services/errors';
import { theme } from '@/theme';

interface MonthPayment {
  id: number;
  apartment_id: number;
  apartment_number: string;
  owner_name: string;
  amount: number;
  paid_date: string;
  note: string;
  month: string | null;
  special_title: string | null;
}

interface MonthAdjustment {
  id: number;
  type: 'increase' | 'decrease';
  amount: number;
  reason: string;
  adjustment_date: string;
  status: string;
}

export default function MonthStatementScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(getCurrentMonth());
  const [totals, setTotals] = useState({ totalCollected: 0, monthCollected: 0, monthExpenses: 0, balance: 0, monthAdjustments: 0 });
  const [apartments, setApartments] = useState<MonthlyApartmentRow[]>([]);
  const [payments, setPayments] = useState<MonthPayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [specials, setSpecials] = useState<SpecialCollectionSummary[]>([]);
  const [adjustments, setAdjustments] = useState<MonthAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboard, apartmentRows, monthExpenses, categoryRows, specialRows, db] = await Promise.all([
        getDashboardTotals(month),
        getMonthlyApartmentRows(month),
        listExpenses(month),
        listExpenseCategories(true),
        listSpecialCollectionSummaries(true),
        getDatabase(),
      ]);
      const [paymentRows, adjustmentRows] = await Promise.all([
        db.getAllAsync<MonthPayment>(
          `SELECT p.id, c.apartment_id, a.number AS apartment_number, a.owner_name,
            p.amount, p.paid_date, p.note, c.month, s.title AS special_title
           FROM payments p JOIN charges c ON c.id = p.charge_id
           JOIN apartments a ON a.id = c.apartment_id
           LEFT JOIN special_collections s ON s.id = c.special_id
           WHERE p.deleted = 0 AND substr(p.paid_date, 1, 7) = ?
           ORDER BY p.paid_date DESC, p.id DESC`,
          month,
        ),
        db.getAllAsync<MonthAdjustment>(
          `SELECT id, type, amount, reason, adjustment_date, status
           FROM adjustments WHERE month = ? ORDER BY adjustment_date DESC, id DESC`,
          month,
        ),
      ]);
      setTotals(dashboard);
      setApartments(apartmentRows);
      setExpenses(monthExpenses);
      setCategories(categoryRows);
      setSpecials(specialRows.filter((item) => item.date.slice(0, 7) === month));
      setPayments(paymentRows);
      setAdjustments(adjustmentRows);
      setError(null);
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر إعداد كشف الشهر.'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const paidApartments = apartments.filter((row) => row.summary.status === 'paid').length;
  const categoryName = (id: number) => categories.find((item) => item.id === id)?.name ?? 'مصروف';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="كشف الشهر" subtitle="ملخص التحصيل والمصروفات والعمليات" />
      <MonthPicker month={month} onChange={setMonth} />
      <MonthTransition month={month}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <><Skeleton height={theme.sizes.skeletonRow} /><Skeleton height={theme.sizes.skeletonRow} /></> : null}
      {!loading ? (
        <>
          <View style={styles.summaryGrid}>
            <Card variant="surface" style={styles.summaryCard}><Text style={styles.label}>التحصيل</Text><MoneyText amount={totals.monthCollected} /></Card>
            <Card variant="surface" style={styles.summaryCard}><Text style={styles.label}>المصروفات</Text><MoneyText amount={totals.monthExpenses} /></Card>
            <Card variant="surface" style={styles.summaryCard}><Text style={styles.label}>الصافي</Text><MoneyText amount={totals.monthCollected - totals.monthExpenses + totals.monthAdjustments} /></Card>
            <Card variant="surface" style={styles.summaryCard}><Text style={styles.label}>الشقق المدفوعة</Text><Text style={styles.count}>{paidApartments} من {apartments.length}</Text></Card>
          </View>
          <Card style={styles.row}><Text style={styles.label}>التسويات</Text><MoneyText amount={totals.monthAdjustments} /></Card>
          <Text style={styles.section}>التحصيلات الخاصة لهذا الشهر</Text>
          {specials.length === 0 ? <EmptyState message="لا توجد تحصيلات خاصة في هذا الشهر." /> : null}
          {specials.map((special) => <Card key={special.id} style={styles.row}><Text style={styles.itemTitle}>{special.title}</Text><MoneyText amount={special.totalCollected} /></Card>)}
          <Text style={styles.section}>دفعات الشهر</Text>
          {payments.length === 0 ? <EmptyState message={`لا توجد دفعات مسجلة في ${getMonthLabel(month)}.`} /> : null}
          {payments.map((payment) => (
            <Pressable key={payment.id} onPress={() => router.push({ pathname: '/apartment-account/[id]', params: { id: String(payment.apartment_id) } })}>
              <Card style={styles.row}>
                <View style={styles.detail}>
                  <Text style={styles.itemTitle}>شقة {payment.apartment_number} — {payment.month ? getMonthLabel(payment.month) : payment.special_title}</Text>
                  <Text style={styles.meta}>{payment.paid_date}{payment.note ? ` · ${payment.note}` : ''}</Text>
                </View>
                <MoneyText amount={payment.amount} size={theme.typography.section} />
              </Card>
            </Pressable>
          ))}
          <Text style={styles.section}>مصروفات الشهر</Text>
          {expenses.length === 0 ? <EmptyState message="لا توجد مصروفات مسجلة في هذا الشهر." /> : null}
          {expenses.map((expense) => <Card key={expense.id} style={styles.row}><View style={styles.detail}><Text style={styles.itemTitle}>{categoryName(expense.category_id)}</Text><Text style={styles.meta}>{expense.expense_date}{expense.note ? ` · ${expense.note}` : ''}</Text></View><MoneyText amount={expense.amount} size={theme.typography.section} /></Card>)}
          {adjustments.length ? <Text style={styles.section}>التسويات</Text> : null}
          {adjustments.map((adjustment) => (
            <Card key={adjustment.id} style={styles.row}>
              <View style={styles.detail}>
                <Text style={styles.itemTitle}>{adjustment.status === 'cancelled' ? 'ملغية' : adjustment.type === 'increase' ? 'زيادة' : 'نقص'} — {adjustment.reason}</Text>
                <Text style={styles.meta}>{adjustment.adjustment_date}</Text>
              </View>
              <MoneyText amount={adjustment.type === 'decrease' ? -adjustment.amount : adjustment.amount} size={theme.typography.section} />
            </Card>
          ))}
        </>
      ) : null}
      </MonthTransition>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: theme.spacingScale.screen, gap: theme.spacingScale.sm, paddingBottom: theme.spacingScale.lg, backgroundColor: theme.colors.background, writingDirection: 'rtl' },
  error: { color: theme.colors.danger, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacingScale.xs },
  summaryCard: { width: theme.sizes.summaryCardWidth, minHeight: theme.sizes.statCard, justifyContent: 'center', alignItems: 'flex-end' },
  label: { color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'right' },
  count: { color: theme.colors.text, fontSize: theme.typography.heading, fontFamily: theme.typography.extraBold },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  detail: { flex: 1, alignItems: 'flex-end', gap: theme.spacingScale.xs },
  itemTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
  meta: { color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.fontFamily, textAlign: 'right' },
  section: { color: theme.colors.text, fontSize: theme.typography.section, fontFamily: theme.typography.extraBold, textAlign: 'right' },
});
