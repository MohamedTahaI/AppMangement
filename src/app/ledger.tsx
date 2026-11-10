import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { FilterBar, type FilterSortOption } from '@/components/ui/FilterBar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { MoneyText } from '@/components/ui/MoneyText';
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
  const [apartmentPickerVisible, setApartmentPickerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<LedgerEntry>(
        `SELECT id, 'payment' AS type, p.paid_date AS date, p.amount,
          c.apartment_id, a.number AS apartment_number, a.owner_name,
          p.note, CASE WHEN c.type = 'monthly' THEN c.month ELSE s.title END AS title,
          NULL AS status
         FROM payments p JOIN charges c ON c.id = p.charge_id
         JOIN apartments a ON a.id = c.apartment_id
         LEFT JOIN special_collections s ON s.id = c.special_id
         WHERE p.deleted = 0
         UNION ALL
         SELECT e.id, 'expense' AS type, e.expense_date AS date, e.amount,
          NULL, NULL, NULL, e.note, ec.name, NULL
         FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
         WHERE e.deleted = 0
         UNION ALL
         SELECT id, 'adjustment' AS type, adjustment_date AS date,
          CASE WHEN type = 'decrease' THEN -amount ELSE amount END,
          NULL, NULL, NULL, reason, CASE WHEN type = 'increase' THEN 'زيادة' ELSE 'نقص' END, status
         FROM adjustments
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
      <SegmentedControl<LedgerType>
        value={type}
        options={[
          { value: 'all', label: 'الكل' },
          { value: 'payment', label: 'دفعات' },
          { value: 'expense', label: 'مصروفات' },
          { value: 'adjustment', label: 'تسويات' },
        ]}
        onChange={setType}
      />
      <Pressable style={styles.apartmentFilter} onPress={() => setApartmentPickerVisible(true)}>
        <Text style={styles.apartmentFilterText}>
          {apartmentFilter === null ? 'كل الشقق' : `شقة ${apartmentOptions.find((item) => item.id === apartmentFilter)?.number ?? ''}`}
        </Text>
      </Pressable>
      <AppBottomSheet
        visible={apartmentPickerVisible}
        title="تصفية حسب الشقة"
        snapPoints={['55%']}
        onClose={() => setApartmentPickerVisible(false)}>
        <Pressable style={styles.apartmentOption} onPress={() => { setApartmentFilter(null); setApartmentPickerVisible(false); }}>
          <Text style={styles.apartmentFilterText}>كل الشقق</Text>
        </Pressable>
        {apartmentOptions.map((item) => (
          <Pressable key={item.id} style={styles.apartmentOption} onPress={() => { setApartmentFilter(item.id); setApartmentPickerVisible(false); }}>
            <Text style={styles.apartmentFilterText}>شقة {item.number}</Text>
          </Pressable>
        ))}
      </AppBottomSheet>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader title="سجل العمليات" subtitle="الدفعات والمصروفات والتسويات" />
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        fromDate={fromDate}
        toDate={toDate}
        onDateRangeChange={(from, to) => { setFromDate(from); setToDate(to); }}
        sort={sort}
        sortOptions={SORT_OPTIONS}
        onSortChange={setSort}
        resultCount={visible.length}
        totalCount={entries.length}
        totalAmount={total}
        extraFilters={extraFilters}
        extraFilterCount={Number(type !== 'all') + Number(apartmentFilter !== null)}
        onClear={() => { setSearch(''); setType('all'); setApartmentFilter(null); setFromDate(''); setToDate(''); setSort('date'); }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <><Skeleton /><Skeleton /></> : null}
      {!loading && visible.length === 0 ? <EmptyState message="لا توجد عمليات تطابق الفلاتر." /> : null}
      {!loading ? visible.map((entry) => (
        <Pressable
          key={`${entry.type}-${entry.id}`}
          disabled={entry.apartment_id === null}
          onPress={() => {
            if (entry.apartment_id !== null) {
              router.push({
                pathname: '/apartment-account/[id]',
                params: { id: String(entry.apartment_id) },
              });
            }
          }}>
          <Card style={styles.row}>
            <View style={styles.details}>
              <Text style={styles.title}>
                {entry.type === 'payment' ? `دفعة — شقة ${entry.apartment_number} — ${entry.title}` : entry.type === 'expense' ? `مصروف — ${entry.title}` : `تسوية — ${entry.title}${entry.status === 'cancelled' ? ' (ملغية)' : ''}`}
              </Text>
              <Text style={styles.meta}>{entry.date}{entry.note ? ` · ${entry.note}` : ''}</Text>
            </View>
            <MoneyText amount={entry.amount} size={theme.typography.section} />
          </Card>
        </Pressable>
      )) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: theme.spacingScale.screen, gap: theme.spacingScale.sm, paddingBottom: theme.spacingScale.lg, backgroundColor: theme.colors.background, writingDirection: 'rtl' },
  error: { color: theme.colors.danger, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  details: { flex: 1, alignItems: 'flex-end', gap: theme.spacingScale.xs },
  title: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
  meta: { color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.fontFamily, textAlign: 'right' },
  filterControls: { gap: theme.spacingScale.xs },
  apartmentFilter: { minHeight: theme.sizes.touch, justifyContent: 'center', paddingHorizontal: theme.spacingScale.xs, borderWidth: theme.borderWidths.hairline, borderColor: theme.colors.border, borderRadius: theme.radii.sm, backgroundColor: theme.colors.surface },
  apartmentFilterText: { color: theme.colors.text, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'right' },
  apartmentOption: { minHeight: theme.sizes.touchCompact, justifyContent: 'center', paddingHorizontal: theme.spacingScale.xs, borderBottomWidth: theme.borderWidths.hairline, borderBottomColor: theme.colors.border },
});
