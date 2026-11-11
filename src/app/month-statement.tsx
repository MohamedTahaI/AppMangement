import { AppText } from '@/components/ui/AppText';
import { Section } from '@/components/ui/Section';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { listExpenseCategories, listExpenses, type Expense, type ExpenseCategory } from '@/db/expenses';
import { getDatabase } from '@/db/schema';
import { getDashboardTotals, getMonthlyApartmentRows, type MonthlyApartmentRow } from '@/services/billing';
import { listSpecialCollectionSummaries, type SpecialCollectionSummary } from '@/services/specialCollections';
import { MonthPicker, getCurrentMonth, getMonthLabel } from '@/components/ui/MonthPicker';
import { MonthTransition } from '@/components/ui/MonthTransition';
import { ActivityRow } from '@/components/ui/ActivityRow';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MoneyText } from '@/components/ui/MoneyText';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
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
      setSpecials(specialRows);
      setPayments(paymentRows);
      setAdjustments(adjustmentRows);
      setError(null);
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل كشف الشهر. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const paidApartments = apartments.filter((row) => row.summary.status === 'paid').length;
  const categoryName = (id: number) => categories.find((item) => item.id === id)?.name ?? 'مصروف';
  const net = totals.monthCollected - totals.monthExpenses + totals.monthAdjustments;

  return (
    <Screen>
      <ScreenHeader title="كشف الشهر" subtitle="ملخص التحصيل والمصروفات والعمليات" />
      <MonthPicker month={month} onChange={setMonth} />
      <MonthTransition month={month}>
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        {loading ? <><Skeleton height={theme.sizes.skeletonRow} /><Skeleton height={theme.sizes.skeletonRow} /></> : null}
        {!loading ? (
          <>
            <View style={styles.summaryGrid}>
              <StatCard title="التحصيل" amount={totals.monthCollected} icon="payments" amountSize={28} labelSize={15} style={styles.gridCard} />
              <StatCard title="المصروفات" amount={totals.monthExpenses} icon="receipt-long" amountSize={28} labelSize={15} style={styles.gridCard} />
              <StatCard title="الصافي" amount={net} icon="trending-up" amountSize={28} labelSize={15} style={styles.gridCard} />
              <StatCard title="الشقق المدفوعة" value={`${paidApartments} من ${apartments.length}`} icon="check-circle" amountSize={28} labelSize={15} style={styles.gridCard} />
            </View>
            <Card variant="surface" style={styles.adjustmentsCard}>
              <AppText style={styles.adjustmentsLabel}>تعديلات الرصيد</AppText>
              <MoneyText amount={totals.monthAdjustments} size={28} />
            </Card>
            <Section title="التحصيلات الخاصة لهذا الشهر">
              {specials.length === 0 ? <EmptyState message="لا توجد تحصيلات خاصة في هذا الشهر." /> : null}
              {specials.map((special) => (
                <Card key={special.id} style={styles.specialRow}>
                  <AppText style={styles.itemTitle}>{special.title}</AppText>
                  <MoneyText amount={special.totalCollected} size={28} />
                </Card>
              ))}
            </Section>
            <Section title="دفعات الشهر">
              {payments.length === 0 ? <EmptyState message={`لا توجد دفعات مسجلة في ${getMonthLabel(month)}.`} /> : null}
              {payments.map((payment) => (
                <ActivityRow
                  key={payment.id}
                  type="payment"
                  title={`شقة ${payment.apartment_number} — ${payment.month ? getMonthLabel(payment.month) : payment.special_title ?? ''}`}
                  date={payment.paid_date}
                  note={payment.note}
                  amount={payment.amount}
                  onPress={() => router.push({ pathname: '/apartment-account/[id]', params: { id: String(payment.apartment_id) } })}
                />
              ))}
            </Section>
            <Section title="مصروفات الشهر">
              {expenses.length === 0 ? <EmptyState message="لا توجد مصروفات مسجلة في هذا الشهر." /> : null}
              {expenses.map((expense) => (
                <ActivityRow
                  key={expense.id}
                  type="expense"
                  title={categoryName(expense.category_id)}
                  date={expense.expense_date}
                  note={expense.note}
                  amount={-expense.amount}
                />
              ))}
            </Section>
            {adjustments.length ? (
              <Section title="تعديلات الرصيد">
                {adjustments.map((adjustment) => (
                  <ActivityRow
                    key={adjustment.id}
                    type="adjustment"
                    title={
                      adjustment.status === 'cancelled'
                        ? 'ملغية'
                        : adjustment.type === 'increase'
                          ? `زيادة — ${adjustment.reason}`
                          : `نقص — ${adjustment.reason}`
                    }
                    date={adjustment.adjustment_date}
                    amount={adjustment.type === 'decrease' ? -adjustment.amount : adjustment.amount}
                  />
                ))}
              </Section>
            ) : null}
          </>
        ) : null}
      </MonthTransition>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: theme.colors.danger, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacingScale.cardGap },
  gridCard: { width: theme.sizes.summaryCardWidth, minHeight: theme.sizes.statCard },
  adjustmentsCard: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  adjustmentsLabel: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  specialRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  itemTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
});
