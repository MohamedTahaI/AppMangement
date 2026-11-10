import { AppText } from '@/components/ui/AppText';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { createSpecialCollection } from '@/services/billing';
import {
  listSpecialCollectionSummaries,
  type SpecialCollectionSummary,
} from '@/services/specialCollections';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { FilterBar } from '@/components/ui/FilterBar';
import { getCurrentMonth } from '@/components/ui/MonthPicker';
import { MoneyText } from '@/components/ui/MoneyText';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { formatDate } from '@/services/dateFormat';
import { theme } from '@/components/ui/theme';
import { arabicErrorMessage } from '@/services/errors';

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function SpecialsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ create?: string }>();
  const [collections, setCollections] = useState<SpecialCollectionSummary[]>([]);
  const [search, setSearch] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<'month' | 'all' | 'closed'>('month');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localToday());
  const [note, setNote] = useState('');
  const [pendingClose, setPendingClose] = useState<SpecialCollectionSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCollections(await listSpecialCollectionSummaries(true));
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل التحصيلات الخاصة.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useFocusEffect(useCallback(() => {
    if (params.create === '1' && !loading) {
      setCreateVisible(true);
      router.setParams({ create: undefined });
    }
  }, [loading, params.create, router]));

  const visibleCollections = collections
    .filter((collection) => collectionFilter === 'closed'
      ? collection.active === 0
      : collection.active === 1 && (collectionFilter === 'all' || collection.date.startsWith(getCurrentMonth())))
    .filter((collection) => `${collection.title} ${collection.note}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  const create = async () => {
    const parsedAmount = Number(amount);
    if (!title.trim()) {
      setError('اكتب اسم التحصيل الخاص.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('اكتب مبلغاً صحيحاً لكل شقة.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await createSpecialCollection({
        title,
        amountPerApartment: parsedAmount,
        date,
        note: note.trim(),
      });
      setCreateVisible(false);
      setTitle('');
      setAmount('');
      setDate(localToday());
      setNote('');
      setNotice('تم إنشاء التحصيل الخاص للشقق النشطة.');
      await load();
      router.push({ pathname: '/special-details/[id]', params: { id: String(id) } });
    } catch (createError) {
      setError(arabicErrorMessage(createError, 'تعذر إنشاء التحصيل الخاص.'));
    } finally {
      setSaving(false);
    }
  };

  const closeCollection = async () => {
    if (!pendingClose) return;
    try {
      const { getDatabase, markDirty } = await import('@/db/schema');
      const db = await getDatabase();
      await db.runAsync('UPDATE special_collections SET active = 0 WHERE id = ?', pendingClose.id);
      await markDirty(db);
      setPendingClose(null);
      setNotice('تم إغلاق التحصيل. بياناته محفوظة.');
      await load();
    } catch (closeError) {
      setError(arabicErrorMessage(closeError, 'تعذر إغلاق التحصيل.'));
      setPendingClose(null);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => router.back()} label="رجوع للتحصيل الشهري" />
        <ScreenTitle title="تحصيلات خاصة" subtitle="مثل صيانة المصعد أو إصلاحات العمارة" />
        <BigButton title="تحصيل جديد" onPress={() => setCreateVisible(true)} />
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchLabel="بحث باسم التحصيل أو الملاحظة"
          searchPlaceholder="اكتب اسم التحصيل"
          extraFilterCount={Number(collectionFilter !== 'month')}
          mainFilters={
            <View style={styles.filterRow}>
              {[
                { value: 'month' as const, label: 'هذا الشهر' },
                { value: 'all' as const, label: 'الكل' },
                { value: 'closed' as const, label: 'مغلقة' },
              ].map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: collectionFilter === option.value }}
                  onPress={() => setCollectionFilter(option.value)}
                  style={[styles.filterOption, collectionFilter === option.value && styles.filterOptionSelected]}>
                  <AppText style={[styles.filterText, collectionFilter === option.value && styles.filterTextSelected]}>
                    {option.label}
                  </AppText>
                </Pressable>
              ))}
            </View>
          }
          resultCount={visibleCollections.length}
          totalCount={collections.length}
          totalAmount={visibleCollections.reduce((sum, collection) => sum + collection.totalTarget - collection.totalCollected, 0)}
          onClear={() => { setSearch(''); setCollectionFilter('month'); }}
        />
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        {notice ? <AppText style={styles.success}>{notice}</AppText> : null}
        {loading ? <AppText style={styles.message}>جارٍ تحميل التحصيلات...</AppText> : null}
        {!loading && visibleCollections.length === 0 ? (
          <EmptyState message="لا توجد تحصيلات خاصة. اضغط «تحصيل جديد» لإضافة تحصيل." />
        ) : null}
        {visibleCollections.map((collection) => {
          const progress =
            collection.totalTarget > 0
              ? Math.min(collection.totalCollected / collection.totalTarget, 1)
              : 0;
          return (
            <Card key={collection.id}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/special-details/[id]',
                    params: { id: String(collection.id) },
                  })
                }>
                <View style={styles.header}>
                  <AppText style={styles.title}>{collection.title}</AppText>
                  <AppText style={styles.date}>{formatDate(collection.date)}</AppText>
                </View>
                <View style={styles.amountRow}>
                  <AppText style={styles.label}>على كل شقة</AppText>
                  <MoneyText amount={collection.amountPerApartment} size={theme.typography.section} />
                </View>
                <View style={styles.amountRow}>
                  <AppText style={styles.label}>تم جمعه / المطلوب</AppText>
                  <AppText style={styles.totals}>
                    {collection.totalCollected.toLocaleString('en-US')} / {collection.totalTarget.toLocaleString('en-US')} ج
                  </AppText>
                </View>
                <View
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
                  style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                </View>
                <AppText style={styles.progressLabel}>
                  {collection.totalTarget > 0 ? `${Math.round(progress * 100)}٪ تم تحصيله` : 'لا توجد شقق نشطة'}
                </AppText>
              </Pressable>
              <View style={styles.cardFooter}>
                {collection.active === 1 ? <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setPendingClose(collection);
                  }}
                  style={styles.closeButton}>
                  <AppText style={styles.closeText}>إغلاق التحصيل</AppText>
                </Pressable> : <AppText style={styles.closedText}>مغلق</AppText>}
              </View>
            </Card>
          );
        })}
      </ScrollView>

      <AppBottomSheet
        visible={createVisible}
        title="تحصيل جديد"
        snapPoints={['66%', '90%']}
        onClose={() => setCreateVisible(false)}>
        <FormField label="اسم التحصيل" value={title} onChangeText={setTitle} placeholder="مثال: صيانة المصعد" />
        <FormField label="المبلغ لكل شقة" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="مثال: 500" />
        <FormField label="التاريخ" value={date} onChangeText={setDate} placeholder="مثال: 2026-01-31" />
        <FormField label="ملاحظة (اختياري)" value={note} onChangeText={setNote} />
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        <BigButton title="إنشاء التحصيل" loading={saving} onPress={() => void create()} />
        <BigButton
          title="إلغاء"
          variant="secondary"
          disabled={saving}
          onPress={() => setCreateVisible(false)}
        />
      </AppBottomSheet>

      <ConfirmDialog
        visible={pendingClose !== null}
        title="إغلاق التحصيل"
        message={`هل تريد إغلاق «${pendingClose?.title ?? ''}»؟ سيختفي من القائمة النشطة، وستبقى بياناته محفوظة.`}
        confirmLabel="نعم، أغلقه"
        onConfirm={() => void closeCollection()}
        onCancel={() => setPendingClose(null)}
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
    minHeight: theme.sizes.touchCompact,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  backText: {
    color: theme.colors.primary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  header: {
    alignItems: 'flex-end',
    gap: theme.spacingScale.xs,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
  },
  date: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
  },
  filterRow: { flexDirection: 'row', gap: theme.spacingScale.xs },
  filterOption: {
    minHeight: theme.sizes.touch,
    minWidth: theme.sizes.specialActionWidth,
    paddingHorizontal: theme.spacingScale.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
  },
  filterOptionSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterText: { color: theme.colors.text, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  filterTextSelected: { color: theme.colors.onPrimary },
  closedText: { color: theme.colors.secondaryText, fontSize: theme.typography.small, textAlign: 'auto' },
  cardFooter: { alignItems: 'flex-start' },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacingScale.xs,
  },
  label: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
  },
  totals: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.extraBold,
  },
  progressTrack: {
    height: theme.sizes.progressBarLarge,
    overflow: 'hidden',
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.border,
  },
  progressFill: {
    height: '100%',
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.success,
  },
  progressLabel: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  closeButton: {
    minHeight: theme.sizes.touchCompact,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  closeText: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
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
});
