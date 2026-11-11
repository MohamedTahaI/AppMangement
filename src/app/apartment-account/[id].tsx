import { AppText } from '@/components/ui/AppText';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { listApartmentPayments, type ApartmentPayment } from '@/db/payments';
import { listApartments, type Apartment } from '@/db/apartments';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { BigButton } from '@/components/ui/BigButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Section } from '@/components/ui/Section';
import { formatDate } from '@/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { MoneyText } from '@/components/ui/MoneyText';
import { getMonthLabel } from '@/components/ui/MonthPicker';
import { getApartmentYearPreviews, type ApartmentMonthPreview } from '@/services/billing';
import { getSpecialApartmentSummaries, listSpecialCollectionSummaries, type SpecialApartmentSummary, type SpecialCollectionSummary } from '@/services/specialCollections';
import { arabicErrorMessage } from '@/services/errors';
import { theme } from '@/theme';

export default function ApartmentAccountScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const id = Number(params.id);
  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [months, setMonths] = useState<ApartmentMonthPreview[]>([]);
  const [specialCharges, setSpecialCharges] = useState<(SpecialApartmentSummary & { title: string })[]>([]);
  const [collections, setCollections] = useState<SpecialCollectionSummary[]>([]);
  const [history, setHistory] = useState<ApartmentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apartments, yearMonths, payments, allCollections] = await Promise.all([
        listApartments(true),
        getApartmentYearPreviews(id, year),
        listApartmentPayments(id),
        listSpecialCollectionSummaries(true),
      ]);
      const specialResults = await Promise.all(
        allCollections.map(async (collection) => ({
          collection,
          row: (await getSpecialApartmentSummaries(collection.id)).find((item) => item.apartmentId === id),
        })),
      );
      setApartment(apartments.find((item) => item.id === id) ?? null);
      setMonths(yearMonths);
      setHistory(payments);
      setCollections(allCollections);
      setSpecialCharges(specialResults.flatMap(({ collection, row }) => row ? [{ ...row, title: collection.title }] : []));
      setError(null);
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل حساب الشقة.'));
    } finally {
      setLoading(false);
    }
  }, [id, year]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const collectionTitle = (payment: ApartmentPayment) =>
    payment.type === 'monthly' && payment.month
      ? getMonthLabel(payment.month)
      : collections.find((item) => item.title === payment.special_title)?.title ?? payment.special_title ?? 'تحصيل خاص';

  return (
    <Screen>
      <ScreenHeader
        title={apartment ? `حساب شقة ${apartment.number}` : 'حساب الشقة'}
        subtitle={apartment?.owner_name || 'اسم المالك غير مسجل'}
      />
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
      {loading ? <><Skeleton height={theme.sizes.skeletonHero} /><Skeleton height={theme.sizes.skeletonMedium} /></> : null}
      {!loading && apartment ? (
        <>
          <BigButton
            title="تسجيل دفعة"
            onPress={() => router.push({ pathname: '/payment', params: { apartmentId: String(id) } })}
          />
          <View style={styles.yearRow}>
            <Pressable onPress={() => setYear((value) => value - 1)} style={styles.yearButton}><AppText style={styles.yearButtonText}>السنة السابقة</AppText></Pressable>
            <AppText style={styles.year}>{year}</AppText>
            <Pressable
              accessibilityState={{ disabled: year >= new Date().getFullYear() }}
              disabled={year >= new Date().getFullYear()}
              onPress={() => setYear((value) => Math.min(new Date().getFullYear(), value + 1))}
              style={[styles.yearButton, year >= new Date().getFullYear() && styles.yearButtonDisabled]}>
              <AppText style={styles.yearButtonText}>السنة التالية</AppText>
            </Pressable>
          </View>
          <Card>
            <AppText style={styles.section}>الاشتراكات الشهرية</AppText>
            <View style={styles.monthGrid}>
              {months.map((month) => (
                <Pressable
                  key={month.month}
                  accessibilityRole="button"
                  accessibilityLabel={`${getMonthLabel(month.month)}: ${month.status === 'paid' ? 'مدفوع' : month.status === 'partial' ? 'جزئي' : 'لم يدفع'}`}
                  onPress={() => router.push({ pathname: '/payment', params: { apartmentId: String(id), month: month.month } })}
                  style={[styles.monthCell, month.status === 'paid' ? styles.paid : month.status === 'partial' ? styles.partial : month.due > 0 ? styles.unpaid : styles.notDue]}>
                  <AppText style={styles.monthText}>{month.month.slice(5, 7)}</AppText>
                  {month.due > 0 ? <StatusChip status={month.status} /> : <AppText style={styles.notDueText}>—</AppText>}
                </Pressable>
              ))}
            </View>
          </Card>
          <Section title="التحصيلات الخاصة">
            {specialCharges.length === 0 ? <EmptyState message="لا توجد تحصيلات خاصة على هذه الشقة." /> : null}
            {specialCharges.map((charge) => (
              <Card key={charge.chargeId} style={styles.specialRow}>
                <View style={styles.specialInfo}>
                  <AppText style={styles.itemTitle}>{charge.title}</AppText>
                  <StatusChip status={charge.status} />
                </View>
                <MoneyText amount={charge.remaining} size={theme.typography.section} />
              </Card>
            ))}
          </Section>
          <Section title="سجل الدفعات">
            {history.length === 0 ? <EmptyState message="لا توجد دفعات مسجلة." /> : null}
            {history.map((payment) => (
              <Card key={payment.id} style={styles.historyRow}>
                <View>
                  <AppText style={styles.itemTitle}>{collectionTitle(payment)}</AppText>
                  <AppText style={styles.meta}>{formatDate(payment.paid_date)}{payment.note ? ` · ${payment.note}` : ''}</AppText>
                </View>
                <MoneyText amount={payment.amount} size={theme.typography.section} />
              </Card>
            ))}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: theme.colors.danger, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  yearRow: { minHeight: theme.sizes.touchCompact + theme.spacingScale.xs / 2, flexDirection: 'row', direction: 'rtl', alignItems: 'center', justifyContent: 'space-between' },
  year: { color: theme.colors.text, fontSize: theme.typography.heading, fontFamily: theme.typography.extraBold },
  yearButton: { minHeight: theme.sizes.touchCompact, justifyContent: 'center', paddingHorizontal: theme.spacingScale.xs },
  yearButtonDisabled: { opacity: 0.55 },
  yearButtonText: { color: theme.colors.primary, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  section: { color: theme.colors.text, fontSize: theme.typography.section, fontFamily: theme.typography.extraBold, textAlign: 'auto' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacingScale.xs },
  monthCell: { width: theme.sizes.monthGridCellWidth, minHeight: theme.sizes.monthCellHeight, padding: theme.spacingScale.xs, gap: theme.spacingScale.xs, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.sm },
  paid: { backgroundColor: theme.colors.paidBackground },
  partial: { backgroundColor: theme.colors.partialBackground },
  unpaid: { backgroundColor: theme.colors.unpaidBackground },
  notDue: { backgroundColor: theme.colors.background },
  monthText: { color: theme.colors.text, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  notDueText: { color: theme.colors.muted, fontSize: theme.typography.body },
  specialRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  specialInfo: { flex: 1, alignItems: 'flex-start', gap: theme.spacingScale.xs },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  itemTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  meta: { color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.fontFamily, textAlign: 'auto' },
});
