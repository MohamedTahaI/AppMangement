import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import type { MonthlyApartmentRow } from '@/services/billing';
import { getMonthlyApartmentRows } from '@/services/billing';
import { Card } from '@/components/ui/Card';
import { BigButton } from '@/components/ui/BigButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, type FilterStatus } from '@/components/ui/FilterBar';
import { getCurrentMonth, getMonthLabel } from '@/components/ui/MonthPicker';
import { MonthTransition } from '@/components/ui/MonthTransition';
import { MoneyText } from '@/components/ui/MoneyText';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { StatusChip } from '@/components/ui/StatusChip';
import { theme } from '@/components/ui/theme';
import { arabicErrorMessage } from '@/services/errors';

export default function CollectionScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(getCurrentMonth());
  const [rows, setRows] = useState<MonthlyApartmentRow[]>([]);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sort, setSort] = useState('apartment');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getMonthlyApartmentRows(month));
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل التحصيل. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const collected = rows.reduce((total, row) => total + row.summary.paid, 0);
  const remaining = rows.reduce((total, row) => total + row.summary.remaining, 0);
  const visibleRows = rows
    .filter((row) => !unpaidOnly || row.summary.status !== 'paid')
    .filter((row) => statusFilter === 'all' || row.summary.status === statusFilter)
    .filter((row) => `${row.apartment.number} ${row.apartment.owner_name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === 'remaining'
      ? b.summary.remaining - a.summary.remaining
      : a.apartment.number.localeCompare(b.apartment.number, undefined, { numeric: true }));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenTitle title="التحصيل الشهري" subtitle="اختر شهراً لعرض التحصيل" />
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/specials')}
        style={styles.specialLink}>
        <View style={styles.specialLinkContent}>
          <Text style={styles.specialLinkText}>تحصيلات خاصة</Text>
          <MaterialIcons name="chevron-left" size={theme.sizes.icon} color={theme.colors.primary} />
        </View>
      </Pressable>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        month={month}
        onMonthChange={setMonth}
        sort={sort}
        sortOptions={[
          { value: 'apartment', label: 'رقم الشقة' },
          { value: 'remaining', label: 'أكبر متبقي' },
        ]}
        onSortChange={setSort}
        resultCount={visibleRows.length}
        totalCount={rows.length}
        totalAmount={visibleRows.reduce((sum, row) => sum + row.summary.remaining, 0)}
        onClear={() => { setSearch(''); setStatusFilter('all'); setUnpaidOnly(false); setSort('apartment'); }}
      />
      <MonthTransition month={month}>
      <View style={styles.summaryRow}>
        <Card variant="surface" style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>تم تحصيله</Text>
          <MoneyText amount={collected} size={theme.typography.section} />
        </Card>
        <Card variant="surface" style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>المتبقي</Text>
          <MoneyText amount={remaining} size={theme.typography.section} />
        </Card>
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>اللي لم يدفعوا فقط</Text>
        <Switch
          value={unpaidOnly}
          onValueChange={setUnpaidOnly}
          trackColor={{ true: theme.colors.primary }}
          accessibilityLabel="اللي لم يدفعوا فقط"
        />
      </View>
      {error ? <Text style={styles.error}>تعذر تحميل التحصيل: {error}</Text> : null}
      {loading ? <Text style={styles.message}>جارٍ تحميل الشقق...</Text> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState message="لا توجد شقق نشطة أو رسوم مستحقة لهذا الشهر. راجع شهر بداية الاشتراك أو أضف الشقق من المزيد." />
      ) : null}
      {!loading && rows.length > 0 && visibleRows.length === 0 ? (
        <EmptyState message={`كل الشقق سددت اشتراك ${getMonthLabel(month)}.`} />
      ) : null}
      {visibleRows.map(({ apartment, summary }) => {
        return (
          <Card key={apartment.id}>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/apartment-account/[id]',
                  params: { id: String(apartment.id) },
                })
              }>
              <View style={styles.apartmentHeader}>
                <StatusChip status={summary.status} />
                <View
                  style={[
                    styles.apartmentAvatar,
                    summary.status === 'paid' && styles.avatarPaid,
                    summary.status === 'partial' && styles.avatarPartial,
                    summary.status === 'unpaid' && styles.avatarUnpaid,
                  ]}>
                  <Text style={[
                    styles.apartmentAvatarText,
                    summary.status === 'paid' && styles.avatarTextPaid,
                    summary.status === 'partial' && styles.avatarTextPartial,
                    summary.status === 'unpaid' && styles.avatarTextUnpaid,
                  ]}>{apartment.number}</Text>
                </View>
                <View style={styles.apartmentName}>
                  <Text style={styles.apartmentTitle}>شقة {apartment.number}</Text>
                  <Text style={styles.owner}>{apartment.owner_name || 'اسم المالك غير مسجل'}</Text>
                </View>
              </View>
              <View style={styles.moneyRow}>
                <Text style={styles.remainingLabel}>
                  {summary.remaining === 0 ? 'المتبقي' : 'المتبقي للدفع'}
                </Text>
                <MoneyText amount={summary.remaining} size={theme.typography.section} />
              </View>
            </Pressable>
            {summary.remaining > 0 ? (
              <BigButton
                title="دفع"
                style={styles.payButton}
                onPress={() => router.push({
                  pathname: '/payment',
                  params: { apartmentId: String(apartment.id), month },
                })}
              />
            ) : null}
          </Card>
        );
      })}
      </MonthTransition>
    </ScrollView>
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
  summaryRow: {
    flexDirection: 'row',
    gap: theme.spacingScale.xs,
  },
  specialLink: {
    minHeight: theme.sizes.touchCompact,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialLinkContent: { flexDirection: 'row', alignItems: 'center', gap: theme.spacingScale.xs },
  specialLinkText: {
    color: theme.colors.onPrimary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  summaryCard: {
    flex: 1,
    minHeight: theme.sizes.statCard,
  },
  summaryLabel: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
  switchRow: {
    minHeight: theme.sizes.touchMedium,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacingScale.xs,
  },
  switchLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
  message: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'center',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
  apartmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacingScale.xs,
    alignItems: 'flex-start',
  },
  apartmentAvatar: {
    minWidth: theme.sizes.avatar,
    height: theme.sizes.avatar,
    paddingHorizontal: theme.spacingScale.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
  },
  avatarPaid: { backgroundColor: theme.colors.paidBackground },
  avatarPartial: { backgroundColor: theme.colors.partialBackground },
  avatarUnpaid: { backgroundColor: theme.colors.unpaidBackground },
  apartmentAvatarText: { fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  avatarTextPaid: { color: theme.colors.success },
  avatarTextPartial: { color: theme.colors.warning },
  avatarTextUnpaid: { color: theme.colors.danger },
  apartmentName: {
    flex: 1,
    gap: theme.spacingScale.xs,
    alignItems: 'flex-end',
  },
  apartmentTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.extraBold,
    textAlign: 'right',
  },
  owner: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
  chip: {
    paddingHorizontal: theme.spacingScale.xs,
    paddingVertical: theme.spacingScale.xs,
    borderRadius: theme.radii.md,
  },
  chipText: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.extraBold,
  },
  moneyRow: {
    marginTop: theme.spacingScale.xs,
    paddingTop: theme.spacingScale.xs,
    borderTopWidth: theme.borderWidths.hairline,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  remainingLabel: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
  },
  payButton: { minWidth: theme.sizes.wideActionWidth, minHeight: theme.sizes.touch, paddingVertical: theme.spacingScale.xs, paddingHorizontal: theme.spacingScale.xs },
});
