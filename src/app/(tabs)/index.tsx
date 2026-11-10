import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { BigButton } from '@/components/ui/BigButton';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { GradientCard } from '@/components/ui/GradientCard';
import { MonthPicker, getCurrentMonth, getMonthLabel } from '@/components/ui/MonthPicker';
import { MonthTransition } from '@/components/ui/MonthTransition';
import { MoneyText } from '@/components/ui/MoneyText';
import { PressableCard } from '@/components/ui/PressableCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { StaggeredEntrance } from '@/components/ui/StaggeredEntrance';
import { StatusChip } from '@/components/ui/StatusChip';
import { arabicErrorMessage } from '@/services/errors';
import { getDashboardTotals, getMonthlyApartmentRows, getUnpaidForMonth, type DashboardTotals, type MonthlyApartmentRow, type UnpaidCharge } from '@/services/billing';
import { listSpecialCollectionSummaries, type SpecialCollectionSummary } from '@/services/specialCollections';
import { getDatabase } from '@/db/schema';
import { getSetting } from '@/db/settings';
import { listApartments } from '@/db/apartments';
import { listFeeRates } from '@/db/fees';
import { theme } from '@/theme';

interface Activity {
  id: number;
  type: 'payment' | 'expense' | 'adjustment';
  date: string;
  title: string;
  amount: number;
}

interface HomeData {
  totals: DashboardTotals;
  rows: MonthlyApartmentRow[];
  unpaid: UnpaidCharge[];
  specials: SpecialCollectionSummary[];
  activities: Activity[];
  apartmentCount: number;
  hasData: boolean;
  backupOld: boolean;
  feeExists: boolean;
  sheetConnected: boolean;
  backupDone: boolean;
}

const EMPTY: HomeData = {
  totals: { totalCollected: 0, totalAdjustments: 0, monthCollected: 0, monthAdjustments: 0, monthExpenses: 0, balance: 0 },
  rows: [],
  unpaid: [],
  specials: [],
  activities: [],
  apartmentCount: 0,
  hasData: false,
  backupOld: true,
  feeExists: false,
  sheetConnected: false,
  backupDone: false,
};

function daysSince(date: string | null): number {
  if (!date) return Infinity;
  const parsed = Date.parse(date);
  return Number.isFinite(parsed) ? (Date.now() - parsed) / 86_400_000 : Infinity;
}

export default function HomeScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<HomeData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
    try {
      const [totals, rows, unpaid, allSpecials, apartments, rates, lastBackup, sheetUrl, db] = await Promise.all([
        getDashboardTotals(month),
        getMonthlyApartmentRows(month),
        getUnpaidForMonth(month),
        listSpecialCollectionSummaries(),
        listApartments(),
        listFeeRates(),
        getSetting('last_backup_at'),
        getSetting('sheet_url'),
        getDatabase(),
      ]);
      const activities = await db.getAllAsync<Activity>(
        `SELECT id, type, date, title, amount FROM (
          SELECT p.id, 'payment' AS type, p.paid_date AS date,
            'دفعة — شقة ' || a.number AS title, p.amount AS amount
          FROM payments p JOIN charges c ON c.id = p.charge_id
          JOIN apartments a ON a.id = c.apartment_id WHERE p.deleted = 0
          UNION ALL
          SELECT e.id, 'expense' AS type, e.expense_date AS date,
            'مصروف — ' || ec.name AS title, -e.amount AS amount
          FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
          WHERE e.deleted = 0
          UNION ALL
          SELECT id, 'adjustment' AS type, adjustment_date AS date,
            'تسوية — ' || reason AS title,
            CASE WHEN type = 'decrease' THEN -amount ELSE amount END AS amount
          FROM adjustments WHERE status = 'active'
        ) ORDER BY date DESC, id DESC LIMIT 5`,
      );
      const [expenseCount, paymentCount] = await Promise.all([
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM expenses WHERE deleted = 0'),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM payments WHERE deleted = 0'),
      ]);
      const backupDone = Boolean(lastBackup);
      setData({
        totals,
        rows,
        unpaid,
        specials: allSpecials.filter((item) => item.active === 1),
        activities,
        apartmentCount: apartments.length,
        hasData: apartments.length > 0 || (expenseCount?.count ?? 0) > 0 || (paymentCount?.count ?? 0) > 0,
        backupOld: daysSince(lastBackup) > 7,
        feeExists: rates.length > 0,
        sheetConnected: Boolean(sheetUrl),
        backupDone,
      });
      setError(null);
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل بيانات الرئيسية. اسحب الشاشة للتحديث.'));
    } finally {
      if (showSkeleton) setLoading(false);
    }
  }, [month]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(false);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const paidCount = data.rows.filter((row) => row.summary.status === 'paid').length;
  const progress = data.apartmentCount ? (paidCount / data.apartmentCount) * 100 : 0;
  const quickActions = [
    { label: 'تسجيل دفعة', icon: 'payments', route: '/choose-apartment' },
    { label: 'مصروف', icon: 'add-card', route: { pathname: '/(tabs)/expenses', params: { add: '1' } } },
    { label: 'تحصيل جديد', icon: 'account-balance-wallet', route: { pathname: '/specials', params: { create: '1' } } },
    { label: 'تسوية', icon: 'tune', route: '/adjustments' },
  ] as const;
  const firstRunSteps = [
    { key: 'apartments', title: 'إضافة الشقق', route: '/apartments', done: data.apartmentCount > 0, icon: 'apartment' },
    { key: 'fee', title: 'تحديد قيمة الاشتراك الشهري', route: '/fee', done: data.feeExists, icon: 'payments' },
    { key: 'sheet', title: 'ربط الجدول الأونلاين (اختياري)', route: '/sync', done: data.sheetConnected, icon: 'cloud-sync' },
    { key: 'backup', title: 'أخذ أول نسخة احتياطية', route: '/export-backup', done: data.backupDone, icon: 'backup' },
  ] as const;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={theme.colors.primary}
          colors={[theme.colors.primary]}
        />
      }>
      <ScreenHeader title="الرئيسية" subtitle={getMonthLabel(month)} />
      <MonthPicker month={month} onChange={setMonth} />
      <MonthTransition month={month}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <><Skeleton height={theme.sizes.skeletonHero} /><Skeleton height={theme.sizes.skeletonRow} /><Skeleton height={theme.sizes.skeletonRow} /></> : null}
      {!loading && data.apartmentCount === 0 ? (
        <View style={styles.firstRun}>
          <Text style={styles.sectionTitle}>ابدأ من هنا</Text>
          <Text style={styles.description}>أكمل الخطوات الأولى لتجهيز حساب العمارة.</Text>
          {firstRunSteps.map((step) => (
            <Pressable
              key={step.key}
              accessibilityRole="button"
              onPress={() => router.push(step.route)}
              style={styles.step}>
              <MaterialIcons name={step.done ? 'check-circle' : step.icon} size={theme.sizes.iconLarge} color={step.done ? theme.colors.success : theme.colors.primary} />
              <Text style={[styles.stepText, step.done && styles.stepDone]}>{step.title}</Text>
              <MaterialIcons name={step.done ? 'check' : 'chevron-left'} size={theme.sizes.icon} color={step.done ? theme.colors.success : theme.colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {!loading && data.apartmentCount > 0 ? (
        <>
          <StaggeredEntrance index={0}>
            <GradientCard>
              <Text style={styles.heroLabel}>إجمالي التحصيل (كل الوقت)</Text>
              <AnimatedNumber
                value={data.totals.totalCollected}
                suffix=" ج"
                suffixColor={theme.colors.onPrimary}
                size={theme.typography.number}
                style={styles.heroAmount}
              />
              <View style={styles.heroBalance}>
                <Text style={styles.heroBalanceLabel}>الرصيد الكلي</Text>
                <MoneyText amount={data.totals.balance} size={theme.typography.body} style={styles.heroBalanceAmount} />
              </View>
              {data.totals.totalAdjustments !== 0 ? (
                <Pressable onPress={() => router.push('/adjustments')} style={styles.heroAdjustment}>
                  <Text style={styles.heroAdjustmentText}>
                    منها تسويات: {data.totals.totalAdjustments > 0 ? '+' : ''}{data.totals.totalAdjustments.toLocaleString('en-US')} ج
                  </Text>
                </Pressable>
              ) : null}
            </GradientCard>
          </StaggeredEntrance>
          <StaggeredEntrance index={1}>
            <View style={styles.statsRow}>
              <StatCard title="تحصيل هذا الشهر" amount={data.totals.monthCollected} icon="payments" style={styles.statCard} />
              <StatCard title="مصروفات هذا الشهر" amount={data.totals.monthExpenses} icon="receipt-long" style={styles.statCard} />
            </View>
          </StaggeredEntrance>
          <StaggeredEntrance index={2}>
            <Card variant="surface" style={styles.progressCard}>
              <View style={styles.progressInfo}>
                <Text style={styles.sectionTitle}>تحصيل {getMonthLabel(month)}</Text>
                <Text style={styles.description}>{paidCount} من {data.apartmentCount} شقة دفعوا</Text>
                <Text style={styles.description}>المتبقي للتحصيل</Text>
                <MoneyText amount={data.rows.reduce((sum, row) => sum + row.summary.remaining, 0)} size={theme.typography.body} />
                <ProgressBar progress={progress} />
              </View>
              <ProgressRing progress={progress} label={`${paidCount}/${data.apartmentCount}`} />
            </Card>
          </StaggeredEntrance>
          <StaggeredEntrance index={3}>
            <View style={styles.quickSection}>
              <Text style={styles.sectionTitle}>إجراءات سريعة</Text>
              <View style={styles.quickRow}>
                {quickActions.map((action) => (
                  <Pressable key={action.label} onPress={() => router.push(action.route)} style={styles.quickAction}>
                    <View style={styles.quickIcon}><MaterialIcons name={action.icon} size={theme.sizes.icon} color={theme.colors.primary} /></View>
                    <Text style={styles.quickLabel}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </StaggeredEntrance>
          <StaggeredEntrance index={4}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>تحصيلات خاصة جارية</Text>
            <Pressable onPress={() => router.push('/specials')}><Text style={styles.link}>عرض الكل</Text></Pressable>
          </View>
          {data.specials.length === 0 ? (
            <Card style={styles.inlineEmpty}>
              <Text style={styles.description}>لا توجد تحصيلات خاصة جارية.</Text>
              <BigButton title="تحصيل جديد" onPress={() => router.push({ pathname: '/specials', params: { create: '1' } })} />
            </Card>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.specialScroll}>
              {data.specials.map((special) => {
                const specialProgress = special.totalTarget > 0 ? special.totalCollected / special.totalTarget * 100 : 0;
                return (
                  <PressableCard
                    key={special.id}
                    onPress={() => router.push({ pathname: '/special-details/[id]', params: { id: String(special.id) } })}
                    cardStyle={styles.specialCard}>
                    <Text style={styles.specialTitle}>{special.title}</Text>
                    <Text style={styles.description}>{special.totalCollected.toLocaleString('en-US')} من {special.totalTarget.toLocaleString('en-US')} ج</Text>
                    <ProgressBar progress={specialProgress} />
                  </PressableCard>
                );
              })}
            </ScrollView>
          )}
          </StaggeredEntrance>
          <StaggeredEntrance index={5}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>لم يدفعوا هذا الشهر ({data.unpaid.length})</Text>
            <Pressable onPress={() => router.push({ pathname: '/overdue', params: { month } })}><Text style={styles.link}>عرض الكل</Text></Pressable>
          </View>
          {data.unpaid.length === 0 ? <EmptyState message={`كل الشقق سددت اشتراك ${getMonthLabel(month)}.`} /> : null}
          {data.unpaid.slice(0, 3).map((row) => (
            <Pressable
              key={row.chargeId}
              onPress={() => router.push({ pathname: '/apartment-account/[id]', params: { id: String(row.apartmentId) } })}>
              <Card style={styles.unpaidRow}>
                <View style={styles.unpaidInfo}>
                  <View style={styles.apartmentAvatar}>
                    <Text style={styles.apartmentAvatarText}>{row.apartmentNumber}</Text>
                  </View>
                  <Text style={styles.description}>{row.ownerName || 'اسم المالك غير مسجل'}</Text>
                  <Text style={styles.description}>متبقي {row.remaining.toLocaleString('en-US')} ج</Text>
                </View>
                <MoneyText amount={row.remaining} size={theme.typography.body} />
                <StatusChip status={row.status} />
                <Pressable
                  accessibilityRole="button"
                  onPress={(event) => {
                    event.stopPropagation();
                    router.push({ pathname: '/payment', params: { apartmentId: String(row.apartmentId), month } });
                  }}
                  style={styles.payButton}>
                  <Text style={styles.payText}>دفع</Text>
                </Pressable>
              </Card>
            </Pressable>
          ))}
          </StaggeredEntrance>
          <StaggeredEntrance index={6}>
          <Text style={styles.sectionTitle}>آخر العمليات</Text>
          {data.activities.length === 0 ? <EmptyState message="لا توجد عمليات مسجلة بعد." /> : null}
          {data.activities.map((activity) => (
            <Card key={`${activity.type}-${activity.id}`} style={styles.activityRow}>
              <View style={styles.unpaidInfo}>
                <Text style={styles.itemTitle}>{activity.title}</Text>
                <Text style={styles.description}>{activity.date}</Text>
              </View>
              <MoneyText amount={activity.amount} size={theme.typography.body} />
            </Card>
          ))}
          {data.hasData && data.backupOld ? (
            <Pressable onPress={() => router.push('/export-backup')}>
              <Card style={styles.backup}>
                <MaterialIcons name="backup" size={theme.sizes.icon} color={theme.colors.warning} />
                <Text style={styles.backupText}>حان وقت أخذ نسخة احتياطية لبيانات العمارة.</Text>
              </Card>
            </Pressable>
          ) : null}
          </StaggeredEntrance>
        </>
      ) : null}
      </MonthTransition>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  container: { flexGrow: 1, padding: theme.spacingScale.screen, gap: theme.spacingScale.sm, paddingBottom: theme.spacingScale.lg, backgroundColor: theme.colors.background, writingDirection: 'rtl' },
  error: { color: theme.colors.danger, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
  firstRun: { gap: theme.spacingScale.xs, padding: theme.spacingScale.sm, borderRadius: theme.radii.md, borderWidth: theme.borderWidths.hairline, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  sectionTitle: { color: theme.colors.text, fontSize: theme.typography.section, fontFamily: theme.typography.extraBold, textAlign: 'right' },
  description: { color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.fontFamily, textAlign: 'right' },
  step: { minHeight: theme.sizes.touch, paddingHorizontal: theme.spacingScale.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: theme.spacingScale.xs, borderRadius: theme.radii.sm, backgroundColor: theme.colors.background },
  stepText: { flex: 1, color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
  stepDone: { color: theme.colors.success },
  heroLabel: { color: theme.colors.onPrimary, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
  heroAmount: { color: theme.colors.onPrimary, fontFamily: theme.typography.extraBold },
  heroBalance: { width: '100%', paddingTop: theme.spacingScale.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: theme.borderWidths.hairline, borderTopColor: theme.colors.dividerOnHero },
  heroBalanceLabel: { color: theme.colors.onPrimary, fontSize: theme.typography.small, fontFamily: theme.typography.medium },
  heroBalanceAmount: { color: theme.colors.onPrimary, fontFamily: theme.typography.bold },
  heroAdjustment: { alignSelf: 'flex-end', minHeight: theme.sizes.touch - theme.spacingScale.xs, justifyContent: 'center' },
  heroAdjustmentText: { color: theme.colors.onPrimary, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'right' },
  statsRow: { flexDirection: 'row', gap: theme.spacingScale.xs },
  statCard: { flex: 1 },
  progressCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  progressInfo: { flex: 1, alignItems: 'flex-end', gap: theme.spacingScale.xs },
  quickSection: { gap: theme.spacingScale.xs },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  quickAction: { flex: 1, minHeight: theme.sizes.quickActionHeight, alignItems: 'center', justifyContent: 'center', gap: theme.spacingScale.xs, paddingHorizontal: theme.spacingScale.xs, borderRadius: theme.radii.md, backgroundColor: theme.colors.surface, borderWidth: theme.borderWidths.hairline, borderColor: theme.colors.border },
  quickIcon: { width: theme.sizes.avatar, height: theme.sizes.avatar, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.pill, backgroundColor: theme.colors.successBackground },
  quickLabel: { color: theme.colors.text, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  link: { color: theme.colors.primary, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  inlineEmpty: { gap: theme.spacingScale.xs },
  specialScroll: { gap: theme.spacingScale.xs, paddingVertical: theme.spacingScale.xs },
  specialCard: { width: theme.sizes.specialCardWidth, minHeight: theme.sizes.collectionCard, justifyContent: 'center', gap: theme.spacingScale.xs },
  specialTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
  unpaidRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs, borderRadius: theme.radii.md },
  unpaidInfo: { flex: 1, alignItems: 'flex-end', gap: theme.spacingScale.xs },
  apartmentAvatar: { minWidth: theme.sizes.avatar, height: theme.sizes.avatar, paddingHorizontal: theme.spacingScale.xs, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.pill, backgroundColor: theme.colors.unpaidBackground },
  apartmentAvatarText: { color: theme.colors.danger, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  itemTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
  payButton: { minHeight: theme.sizes.touch, minWidth: theme.sizes.minActionWidth, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.sm, backgroundColor: theme.colors.primary },
  payText: { color: theme.colors.onPrimary, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  activityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  backup: { minHeight: theme.sizes.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: theme.spacingScale.xs, backgroundColor: theme.colors.warningBackground },
  backupText: { flex: 1, color: theme.colors.warning, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'right' },
});
