import { AppText } from '@/components/ui/AppText';
import { Section } from '@/components/ui/Section';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FilterBar, type FilterSortOption } from '@/components/ui/FilterBar';
import { ActivityRow, type ActivityType } from '@/components/ui/ActivityRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { getDatabase } from '@/db/schema';
import { arabicErrorMessage } from '@/services/errors';
import { theme } from '@/theme';

type LedgerType = 'all' | 'payment' | 'expense' | 'adjustment';
interface LedgerEntry {
  id: number;
  type: Exclude<LedgerType, 'all'>;
  date: string;
  amount: number;
  apartment_id: number | null;
  apartment_number: string | null;
  owner_name: string | null;
  note: string;
  title: string;
  status: string | null;
}

const SORT_OPTIONS: FilterSortOption[] = [
  { value: 'date', label: 'التاريخ' },
  { value: 'amount', label: 'المبلغ' },
];

export default function LedgerScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<LedgerType>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState('date');
  const [apartmentFilter, setApartmentFilter] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<LedgerEntry>(
        `WITH ledger_entries AS (
         SELECT p.id, 'payment' AS type, p.paid_date AS date, p.amount,
          c.apartment_id, a.number AS apartment_number, a.owner_name,
          p.note, CASE WHEN c.type = 'monthly' THEN c.month ELSE s.title END AS title,
          NULL AS status
         FROM payments p JOIN charges c ON c.id = p.charge_id
         JOIN apartments a ON a.id = c.apartment_id
         LEFT JOIN special_collections s ON s.id = c.special_id
         WHERE p.deleted = 0
         UNION ALL
         SELECT e.id, 'expense' AS type, e.expense_date AS date, -e.amount AS amount,
          NULL, NULL, NULL, e.note, ec.name, NULL
         FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
         WHERE e.deleted = 0
         UNION ALL
         SELECT adj.id, 'adjustment' AS type, adj.adjustment_date AS date,
          CASE WHEN adj.type = 'decrease' THEN -adj.amount ELSE adj.amount END AS amount,
          NULL AS apartment_id, NULL AS apartment_number, NULL AS owner_name,
          adj.reason AS note,
          CASE WHEN adj.type = 'increase' THEN 'زيادة' ELSE 'نقص' END AS title,
          adj.status AS status
         FROM adjustments adj
        )
        SELECT id, type, date, amount, apartment_id, apartment_number, owner_name, note, title, status
        FROM ledger_entries
        ORDER BY date DESC, id DESC`,
      );
      setEntries(rows);
      setError(null);
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل سجل العمليات.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return entries
      .filter((entry) => type === 'all' || entry.type === type)
      .filter((entry) => apartmentFilter === null || entry.apartment_id === apartmentFilter)
      .filter((entry) => !query || `${entry.apartment_number ?? ''} ${entry.owner_name ?? ''} ${entry.note} ${entry.title}`.toLocaleLowerCase().includes(query))
      .filter((entry) => !fromDate || entry.date >= fromDate)
      .filter((entry) => !toDate || entry.date <= toDate)
      .sort((a, b) => sort === 'amount' ? Math.abs(b.amount) - Math.abs(a.amount) : b.date.localeCompare(a.date));
  }, [apartmentFilter, entries, fromDate, search, sort, toDate, type]);

  const total = visible.reduce((sum, entry) => sum + entry.amount, 0);
  const apartmentOptions = Array.from(
    new Map(entries.filter((entry) => entry.apartment_id !== null)
      .map((entry) => [entry.apartment_id!, { id: entry.apartment_id!, number: entry.apartment_number ?? '' }])).values(),
  ).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const extraFilters = (
    <View style={styles.filterControls}>
      <AppText style={styles.filterTitle}>الشقة</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.apartmentOptions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: apartmentFilter === null }}
          style={[styles.apartmentOption, apartmentFilter === null && styles.apartmentOptionSelected]}
          onPress={() => setApartmentFilter(null)}>
          <AppText style={styles.apartmentFilterText}>كل الشقق</AppText>
        </Pressable>
        {apartmentOptions.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: apartmentFilter === item.id }}
            style={[styles.apartmentOption, apartmentFilter === item.id && styles.apartmentOptionSelected]}
            onPress={() => setApartmentFilter(item.id)}>
            <AppText style={styles.apartmentFilterText}>شقة {item.number}</AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Screen>
      <ScreenHeader title="سجل العمليات" subtitle="الدفعات والمصروفات وتعديلات الرصيد" />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        fromDate={fromDate}
        toDate={toDate}
        onDateRangeChange={(from, to) => { setFromDate(from); setToDate(to); }}
        defaultSort="date"
        sort={sort}
        sortOptions={SORT_OPTIONS}
        onSortChange={setSort}
        resultCount={visible.length}
        totalCount={entries.length}
        totalAmount={total}
        mainFilters={
          <SegmentedControl<LedgerType>
            value={type}
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'payment', label: 'دفعات' },
              { value: 'expense', label: 'مصروفات' },
              { value: 'adjustment', label: 'التعديلات' },
            ]}
            onChange={setType}
          />
        }
        extraFilters={extraFilters}
        extraFilterCount={Number(type !== 'all') + Number(apartmentFilter !== null)}
        onClear={() => { setSearch(''); setType('all'); setApartmentFilter(null); setFromDate(''); setToDate(''); setSort('date'); }}
      />
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
      {loading ? <><Skeleton /><Skeleton /></> : null}
      {!loading && visible.length === 0 ? <EmptyState message="لا توجد عمليات تطابق الفلاتر." /> : null}
      {!loading ? visible.map((entry) => (
        <ActivityRow
          key={`${entry.type}-${entry.id}`}
          type={entry.type as ActivityType}
          title={entry.type === 'payment'
            ? `شقة ${entry.apartment_number} — ${entry.title}`
            : entry.type === 'expense'
              ? entry.title
              : `${entry.title}${entry.status === 'cancelled' ? ' (ملغى)' : ''}`}
          date={entry.date}
          note={entry.note}
          amount={entry.amount}
          onPress={entry.apartment_id === null
            ? undefined
            : () => router.push({
              pathname: '/apartment-account/[id]',
              params: { id: String(entry.apartment_id) },
            })}
        />
      )) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: theme.colors.danger, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  filterControls: { gap: theme.spacingScale.xs },
  filterTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  apartmentOptions: { gap: theme.spacingScale.xs, paddingVertical: theme.spacingScale.xs },
  apartmentFilterText: { color: theme.colors.text, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'auto' },
  apartmentOption: { minHeight: theme.sizes.touch, justifyContent: 'center', paddingHorizontal: theme.spacingScale.sm, borderWidth: theme.borderWidths.hairline, borderColor: theme.colors.border, borderRadius: theme.radii.sm, backgroundColor: theme.colors.surface },
  apartmentOptionSelected: { backgroundColor: theme.colors.paidBackground, borderColor: theme.colors.primary },
});
