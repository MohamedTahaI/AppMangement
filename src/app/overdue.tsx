import { SectionHeader } from '@/components/ui/SectionHeader';
import { AppText } from '@/components/ui/AppText';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, type FilterStatus } from '@/components/ui/FilterBar';
import { getCurrentMonth, getMonthLabel } from '@/components/ui/MonthPicker';
import { MonthTransition } from '@/components/ui/MonthTransition';
import { MoneyText } from '@/components/ui/MoneyText';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { theme } from '@/components/ui/theme';
import { getUnpaidForMonth, getUnpaidForSpecial, type UnpaidCharge } from '@/services/billing';
import { arabicErrorMessage } from '@/services/errors';
import { listSpecialCollectionSummaries, type SpecialCollectionSummary } from '@/services/specialCollections';

type Mode = 'monthly' | 'special';

export default function OverdueScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; month?: string; specialId?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'special' ? 'special' : 'monthly');
  const [month, setMonth] = useState(params.month ?? getCurrentMonth());
  const [collections, setCollections] = useState<SpecialCollectionSummary[]>([]);
  const [specialId, setSpecialId] = useState<number | null>(
    params.specialId ? Number(params.specialId) : null,
  );
  const [rows, setRows] = useState<UnpaidCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sort, setSort] = useState('remaining');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const activeCollections = await listSpecialCollectionSummaries();
      setCollections(activeCollections);
      if (mode === 'monthly') {
        setRows(await getUnpaidForMonth(month));
      } else {
        const selectedId =
          specialId && activeCollections.some((item) => item.id === specialId)
            ? specialId
            : activeCollections[0]?.id ?? null;
        setSpecialId(selectedId);
        const outstanding = selectedId ? await getUnpaidForSpecial(selectedId) : [];
        setRows(outstanding.filter((row) => row.status === 'unpaid'));
      }
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل قائمة المتأخرين. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  }, [mode, month, specialId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const selectedSpecial = collections.find((item) => item.id === specialId);
  const visibleRows = rows
    .filter((row) => statusFilter === 'all' || row.status === statusFilter)
    .filter((row) => `${row.apartmentNumber} ${row.ownerName}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === 'apartment'
      ? a.apartmentNumber.localeCompare(b.apartmentNumber, undefined, { numeric: true })
      : b.remaining - a.remaining);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BackButton onPress={() => router.back()} label="رجوع" />
      <ScreenTitle title="المتأخرين" subtitle="الشقق التي عليها مبالغ متبقية" />
      <SegmentedControl<Mode>
        value={mode}
        options={[
          { value: 'monthly', label: 'الفاتورة الشهرية' },
          { value: 'special', label: 'تحصيل خاص' },
        ]}
        onChange={setMode}
      />

      {mode === 'monthly' ? (
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
          defaultSort="remaining"
          onSortChange={setSort}
          resultCount={visibleRows.length}
          totalCount={rows.length}
          totalAmount={visibleRows.reduce((sum, row) => sum + row.remaining, 0)}
          onClear={() => { setSearch(''); setStatusFilter('all'); setSort('remaining'); setMonth(getCurrentMonth()); }}
        />
      ) : (
        <View style={styles.collectionPicker}>
          <SectionHeader title="اختر التحصيل الخاص" />
          {loading ? (
            <Skeleton height={theme.sizes.skeletonRow} />
          ) : collections.length === 0 ? (
            <EmptyState
              message="لا توجد تحصيلات خاصة نشطة. أنشئ تحصيلاً جديداً للبدء."
              actionLabel="تحصيل جديد"
              onAction={() => router.push({ pathname: '/specials', params: { create: '1' } })}
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.collectionChoices}>
              {collections.map((collection) => {
                const selected = specialId === collection.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={collection.id}
                    onPress={() => setSpecialId(collection.id)}
                    style={[styles.collectionChoice, selected && styles.collectionSelected]}>
                    <AppText style={[styles.collectionText, selected && styles.collectionTextSelected]}>
                      {collection.title}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}
      {mode === 'special' && selectedSpecial ? (
        <AppText style={styles.context}>المتأخرون في: {selectedSpecial.title}</AppText>
      ) : null}
      {mode === 'special' && selectedSpecial ? (
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          status={statusFilter}
          onStatusChange={setStatusFilter}
          sort={sort}
          sortOptions={[
            { value: 'apartment', label: 'رقم الشقة' },
            { value: 'remaining', label: 'أكبر متبقي' },
          ]}
          defaultSort="remaining"
          onSortChange={setSort}
          resultCount={visibleRows.length}
          totalCount={rows.length}
          totalAmount={visibleRows.reduce((sum, row) => sum + row.remaining, 0)}
          onClear={() => { setSearch(''); setStatusFilter('all'); setSort('remaining'); }}
        />
      ) : null}
      {mode === 'monthly' || selectedSpecial ? <MonthTransition month={month}>
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
      {loading ? (
        <View style={styles.loadingList}>
          <Skeleton height={theme.sizes.skeletonRow} />
          <Skeleton height={theme.sizes.skeletonRow} />
          <Skeleton height={theme.sizes.skeletonRow} />
        </View>
      ) : null}
      {!loading && visibleRows.length === 0 ? (
        <EmptyState
          message={
            mode === 'monthly'
              ? `لا توجد مبالغ متأخرة في ${getMonthLabel(month)}.`
              : 'لا توجد شقق لم تدفع هذا التحصيل.'
          }
        />
      ) : null}
      {!loading ? visibleRows.map((row) => (
        <Card key={row.chargeId} style={styles.chargeCard}>
          <Pressable
            onPress={() => router.push({ pathname: '/apartment-account/[id]', params: { id: String(row.apartmentId) } })}>
            <View style={styles.row}>
              <View style={styles.apartment}>
                <View
                  style={[
                    styles.apartmentAvatar,
                    row.status === 'paid' && styles.avatarPaid,
                    row.status === 'partial' && styles.avatarPartial,
                    row.status === 'unpaid' && styles.avatarUnpaid,
                  ]}>
                  <AppText style={[
                    styles.apartmentAvatarText,
                    row.status === 'paid' && styles.avatarTextPaid,
                    row.status === 'partial' && styles.avatarTextPartial,
                    row.status === 'unpaid' && styles.avatarTextUnpaid,
                  ]}>{row.apartmentNumber}</AppText>
                </View>
                <AppText style={styles.apartmentOwner}>{row.ownerName || 'اسم المالك غير مسجل'}</AppText>
                <StatusChip status={row.status} />
              </View>
              <View style={styles.remaining}>
                <AppText style={styles.owner}>المتبقي</AppText>
                <MoneyText amount={row.remaining} size={theme.typography.section} />
              </View>
            </View>
          </Pressable>
          <BigButton
            title="دفع"
            style={styles.payButton}
            onPress={() => mode === 'monthly'
              ? router.push({
                pathname: '/payment',
                params: { apartmentId: String(row.apartmentId), month },
              })
              : row.specialId
                ? router.push({
                  pathname: '/special-details/[id]',
                  params: { id: String(row.specialId), payApartmentId: String(row.apartmentId) },
                })
                : undefined}
          />
        </Card>
      )) : null}
      </MonthTransition> : null}
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
  collectionPicker: {
    gap: theme.spacingScale.xs,
  },
  collectionChoices: { gap: theme.spacingScale.xs, paddingVertical: theme.spacingScale.xs },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
  },
  collectionChoice: {
    width: theme.sizes.specialCardWidth,
    minHeight: theme.sizes.touch,
    paddingHorizontal: theme.spacingScale.sm,
    justifyContent: 'center',
    borderRadius: theme.radius,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  collectionSelected: {
    borderWidth: theme.borderWidths.strong,
    borderColor: theme.colors.primary,
  },
  collectionText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  collectionTextSelected: {
    color: theme.colors.primary,
    fontFamily: theme.typography.extraBold,
  },
  context: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  loadingList: {
    gap: theme.spacingScale.xs,
  },
  chargeCard: {
    minHeight: theme.sizes.collectionCard,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacingScale.xs,
  },
  apartment: {
    flex: 1,
    alignItems: 'flex-end',
    gap: theme.spacingScale.xs,
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
  apartmentOwner: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  apartmentName: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.extraBold,
  },
  owner: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  remaining: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: theme.spacingScale.xs,
  },
  payButton: { minWidth: theme.sizes.actionWidth, minHeight: theme.sizes.touch, paddingVertical: theme.spacingScale.xs, paddingHorizontal: theme.spacingScale.xs },
});
