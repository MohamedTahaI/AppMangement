import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { ActivityRow, type ActivityType } from '@/components/ui/ActivityRow';
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
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { StaggeredEntrance } from '@/components/ui/StaggeredEntrance';
import { StatusChip } from '@/components/ui/StatusChip';
import { Toast } from '@/components/ui/Toast';
import { arabicErrorMessage } from '@/services/errors';
import { getSyncStatus, subscribeToSyncStatus, takeUnlinkedToast, type SyncStatus } from '@/services/sync';
import { getDashboardTotals, getMonthlyApartmentRows, getUnpaidForMonth, type DashboardTotals, type MonthlyApartmentRow, type UnpaidCharge } from '@/services/billing';
import { listSpecialCollectionSummaries, type SpecialCollectionSummary } from '@/services/specialCollections';
import { getDatabase } from '@/db/schema';
import { getSetting, setSetting } from '@/db/settings';
import { listApartments } from '@/db/apartments';
import { listFeeRates } from '@/db/fees';
import { theme } from '@/theme';

interface Activity {
  id: number;
  type: ActivityType;
  date: string;
  title: string;
  note: string;
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
  const params = useLocalSearchParams<{ restored?: string }>();
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<HomeData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedRestoreNotice, setDismissedRestoreNotice] = useState<string | null>(null);
  const [bannerCooldown, setBannerCooldown] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: 'unbound',
    lastSyncedAt: null,
    error: null,
    pendingCount: 0,
  });
  const [toastVisible, setToastVisible] = useState(false);
  const restoreNotice = params.restored && params.restored !== dismissedRestoreNotice;

  const load = useCallback(async (showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
    try {
      const [totals, rows, unpaid, allSpecials, apartments, rates, lastBackup, sheetUrl, dismissedAt, db] = await Promise.all([
        getDashboardTotals(month),
        getMonthlyApartmentRows(month),
        getUnpaidForMonth(month),
        listSpecialCollectionSummaries(),
        listApartments(),
        listFeeRates(),
        getSetting('last_backup_at'),
        getSetting('sheet_url'),
        getSetting('sync_banner_dismissed_at'),
        getDatabase(),
      ]);
      setBannerCooldown(
        dismissedAt ? Date.now() - Date.parse(dismissedAt) < 24 * 60 * 60 * 1000 : false,
      );
      const activities = await db.getAllAsync<Activity>(
        `SELECT id, type, date, title, note, amount FROM (
          SELECT p.id, 'payment' AS type, p.paid_date AS date,
            'شقة ' || a.number || ' — ' || CASE WHEN c.type = 'monthly' THEN c.month ELSE s.title END AS title,
            p.note AS note, p.amount AS amount
          FROM payments p JOIN charges c ON c.id = p.charge_id
          JOIN apartments a ON a.id = c.apartment_id
          LEFT JOIN special_collections s ON s.id = c.special_id
          WHERE p.deleted = 0
          UNION ALL
          SELECT e.id, 'expense' AS type, e.expense_date AS date,
            ec.name AS title, e.note AS note, -e.amount AS amount
          FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
          WHERE e.deleted = 0
          UNION ALL
          SELECT id, 'adjustment' AS type, adjustment_date AS date,
            CASE WHEN type = 'increase' THEN 'زيادة' ELSE 'نقص' END AS title,
            reason AS note,
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

  useFocusEffect(useCallback(() => {
    const update = () => {
      void getSyncStatus().then((status) => {
        setSyncStatus(status);
        if (takeUnlinkedToast()) setToastVisible(true);
      }).catch(() => undefined);
    };
    update();
    return subscribeToSyncStatus(update);
  }, []));

  const dismissSyncBanner = () => {
    const value = new Date().toISOString();
    setBannerCooldown(true);
    void setSetting('sync_banner_dismissed_at', value).catch(() => undefined);
  };
  const showUnlinkedBanner = !loading && data.apartmentCount > 0 && !data.sheetConnected && !bannerCooldown;
  const showPendingBanner = data.sheetConnected && syncStatus.pendingCount > 0;

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
    { label: 'تعديل الرصيد', icon: 'tune', route: '/adjustments' },
  ] as const;
  const firstRunSteps = [
    { key: 'apartments', title: 'إضافة الشقق', route: '/apartments', done: data.apartmentCount > 0, icon: 'apartment' },
    { key: 'fee', title: 'تحديد قيمة الفاتورة الشهرية', route: '/fee', done: data.feeExists, icon: 'payments' },
    { key: 'sheet', title: 'ربط الجدول الأونلاين (اختياري)', route: '/sync', done: data.sheetConnected, icon: 'cloud-sync' },
    { key: 'backup', title: 'أخذ أول نسخة احتياطية', route: '/backup', done: data.backupDone, icon: 'backup' },
  ] as const;
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={theme.colors.primary}
          colors={[theme.colors.primary]}
        />
      }>




      <ScreenHeader title="الرئيسية" subtitle={getMonthLabel(month)} />
      {restoreNotice ? (
        <Pressable onPress={() => setDismissedRestoreNotice(params.restored ?? null)}>
          <AppText style={styles.restoreNotice}>تمت استعادة البيانات بنجاح.</AppText>
        </Pressable>
      ) : null}
      {showUnlinkedBanner ? (
        <Pressable onPress={() => router.push('/sync')} style={styles.syncBanner}>
          <MaterialIcons name="cloud-off" size={theme.sizes.icon} color={theme.colors.warning} />
          <View style={styles.syncBannerCopy}>
            <AppText style={styles.syncBannerText}>
              الجدول الأونلاين غير مربوط — بياناتك محفوظة وستُرسل عند الربط
            </AppText>
            <AppText style={styles.syncBannerLink}>ربط الجدول</AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إخفاء التنبيه"
            hitSlop={10}
            onPress={(event) => {
              event.stopPropagation();
              dismissSyncBanner();
            }}
            style={styles.syncBannerClose}>
            <MaterialIcons name="close" size={theme.sizes.iconSmall} color={theme.colors.warning} />
          </Pressable>
        </Pressable>
      ) : null}
      {showPendingBanner ? (
        <Pressable onPress={() => router.push('/sync')} style={styles.syncBannerPending}>
          <MaterialIcons name="cloud-upload" size={theme.sizes.icon} color={theme.colors.warning} />
          <AppText style={styles.syncPendingText}>{syncStatus.pendingCount} تغيير في انتظار الإرسال</AppText>
        </Pressable>
      ) : null}
      <MonthPicker month={month} onChange={setMonth} />
      <MonthTransition month={month}>
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
      {loading ? <><Skeleton height={theme.sizes.skeletonHero} /><Skeleton height={theme.sizes.skeletonRow} /><Skeleton height={theme.sizes.skeletonRow} /></> : null}
      {!loading && data.apartmentCount === 0 ? (
        <View style={styles.firstRun}>
          <SectionHeader title="ابدأ من هنا" />
          <AppText style={styles.description}>أكمل الخطوات الأولى لتجهيز حساب العمارة.</AppText>
          {firstRunSteps.map((step) => (
            <Pressable
              key={step.key}
              accessibilityRole="button"
              onPress={() => router.push(step.route)}
              style={styles.step}>
              <MaterialIcons name={step.done ? 'check-circle' : step.icon} size={theme.sizes.iconLarge} color={step.done ? theme.colors.success : theme.colors.primary} />
              <AppText style={[styles.stepText, step.done && styles.stepDone]}>{step.title}</AppText>
              <MaterialIcons name={step.done ? 'check' : 'chevron-left'} size={theme.sizes.icon} color={step.done ? theme.colors.success : theme.colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {!loading && data.apartmentCount > 0 ? (
        <View style={styles.homeSections}>
          <View style={styles.heroStatsGroup}>
          <StaggeredEntrance index={0}>
            <GradientCard>
              <View style={styles.heroBalanceRow}>
                <AppText style={styles.heroBalanceLabel}>الرصيد الكلي</AppText>
                <AnimatedNumber
                  value={data.totals.balance}
                  suffix=" ج"
                  suffixColor={theme.colors.onPrimary}
                  size={theme.typography.number}
                  style={styles.heroAmount}
                />
              </View>
              <View style={styles.heroCollected}>
                <AppText style={styles.heroCollectedLabel}>إجمالي التحصيل</AppText>
                <MoneyText
                  amount={data.totals.totalCollected}
                  size={theme.typography.body}
                  currencyColor={theme.colors.heroMuted}
                  style={styles.heroCollectedAmount}
                />
              </View>
              {data.totals.totalAdjustments !== 0 ? (
                <Pressable onPress={() => router.push('/adjustments')} style={styles.heroAdjustment}>
                  <AppText style={styles.heroAdjustmentText}>
                    منها تعديل الرصيد: {data.totals.totalAdjustments > 0 ? '+' : ''}{data.totals.totalAdjustments.toLocaleString('en-US')} ج
                  </AppText>
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
          </View>
          <StaggeredEntrance index={2}>
            <Card variant="surface" style={styles.progressCard}>
              <View style={styles.progressInfo}>
                <SectionHeader title={`تحصيل ${getMonthLabel(month)}`} />
                <AppText style={styles.description}>{paidCount} من {data.apartmentCount} شقة دفعوا</AppText>
                <AppText style={styles.description}>المتبقي للتحصيل</AppText>
                <MoneyText amount={data.rows.reduce((sum, row) => sum + row.summary.remaining, 0)} size={theme.typography.body} />
                <ProgressBar progress={progress} />
              </View>
              <ProgressRing progress={progress} label={`${paidCount}/${data.apartmentCount}`} />
            </Card>
          </StaggeredEntrance>
          <StaggeredEntrance index={3}>
            <View style={styles.quickSection}>
              <SectionHeader title="إجراءات سريعة" />
              <View style={styles.quickRow}>
                {quickActions.map((action) => (
                  <Pressable key={action.label} onPress={() => router.push(action.route)} style={styles.quickAction}>
                    <View style={styles.quickIcon}><MaterialIcons name={action.icon} size={theme.sizes.icon} color={theme.colors.primary} /></View>
                    <AppText style={styles.quickLabel}>{action.label}</AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          </StaggeredEntrance>
          <StaggeredEntrance index={4}>
          <View style={styles.homeSection}>
          <SectionHeader
            title="تحصيلات خاصة جارية"
            action={<Pressable onPress={() => router.push('/specials')}><AppText style={styles.link}>عرض الكل</AppText></Pressable>}
          />
          {data.specials.length === 0 ? (
            <Card style={styles.inlineEmpty}>
              <AppText style={styles.description}>لا توجد تحصيلات خاصة جارية.</AppText>
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
                    <AppText style={styles.specialTitle}>{special.title}</AppText>
                    <AppText style={styles.description}>{special.totalCollected.toLocaleString('en-US')} من {special.totalTarget.toLocaleString('en-US')} ج</AppText>
                    <ProgressBar progress={specialProgress} />
                  </PressableCard>
                );
              })}
            </ScrollView>
          )}
          </View>
          </StaggeredEntrance>
          <StaggeredEntrance index={5}>
          <View style={styles.homeSection}>
          <SectionHeader
            title={`لم يدفعوا هذا الشهر (${data.unpaid.length})`}
            action={<Pressable onPress={() => router.push({ pathname: '/overdue', params: { month } })}><AppText style={styles.link}>عرض الكل</AppText></Pressable>}
          />
          {data.unpaid.length === 0 ? <EmptyState message={`كل الشقق سددت اشتراك ${getMonthLabel(month)}.`} /> : null}
          {data.unpaid.slice(0, 3).map((row) => (
            <Pressable
              key={row.chargeId}
              onPress={() => router.push({ pathname: '/apartment-account/[id]', params: { id: String(row.apartmentId) } })}>
              <Card style={styles.unpaidRow}>
                <View style={styles.unpaidInfo}>
                  <View style={styles.apartmentAvatar}>
                    <AppText style={styles.apartmentAvatarText}>{row.apartmentNumber}</AppText>
                  </View>
                  <AppText style={styles.description}>{row.ownerName || 'اسم المالك غير مسجل'}</AppText>
                  <AppText style={styles.description}>متبقي {row.remaining.toLocaleString('en-US')} ج</AppText>
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
                  <AppText style={styles.payText}>دفع</AppText>
                </Pressable>
              </Card>
            </Pressable>
          ))}
          </View>
          </StaggeredEntrance>
          <StaggeredEntrance index={6}>
          <View style={styles.homeSection}>
          <SectionHeader title="آخر العمليات" />
          {data.activities.length === 0 ? <EmptyState message="لا توجد عمليات مسجلة بعد." /> : null}
          {data.activities.map((activity) => (
            <ActivityRow
              key={`${activity.type}-${activity.id}`}
              type={activity.type}
              title={activity.title}
              date={activity.date}
              note={activity.note}
              amount={activity.amount}
            />
          ))}
          {data.hasData && data.backupOld ? (
            <Pressable onPress={() => router.push('/backup')}>
              <Card style={styles.backup}>
                <MaterialIcons name="backup" size={theme.sizes.icon} color={theme.colors.warning} />
                <AppText style={styles.backupText}>حان وقت أخذ نسخة احتياطية لبيانات العمارة.</AppText>
              </Card>
            </Pressable>
          ) : null}
          </View>
          </StaggeredEntrance>
        </View>
      ) : null}
      </MonthTransition>

    <Toast
      visible={toastVisible}
      message="بياناتك محفوظة على الهاتف. اربط الجدول لإرسالها."
      variant="info"
      onDismiss={() => setToastVisible(false)}
    />
  </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  syncBanner: {
    minHeight: theme.sizes.touch,
    padding: theme.spacingScale.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacingScale.xs,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.warningBackground,
  },
  syncBannerPending: {
    minHeight: theme.sizes.touch,
    padding: theme.spacingScale.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacingScale.xs,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.warningBackground,
  },
  syncBannerCopy: { flex: 1, gap: theme.spacingScale.xs },
  syncBannerText: {
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  syncPendingText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.small,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  syncBannerLink: {
    color: theme.colors.primary,
    fontSize: theme.typography.small,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
  },
  syncBannerClose: {
    width: theme.sizes.touchCompact,
    height: theme.sizes.touchCompact,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { flexGrow: 1, padding: theme.spacingScale.screen, gap: theme.spacingScale.sm, paddingBottom: theme.spacingScale.lg, backgroundColor: theme.colors.background, writingDirection: 'rtl' },
  homeSections: { gap: theme.spacingScale.section },
  heroStatsGroup: { gap: theme.spacingScale.sm },
  homeSection: { gap: theme.spacingScale.sm },
  error: { color: theme.colors.danger, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  restoreNotice: { padding: theme.spacingScale.sm, color: theme.colors.success, backgroundColor: theme.colors.successBackground, borderRadius: theme.radii.sm, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  firstRun: { gap: theme.spacingScale.xs, padding: theme.spacingScale.sm, borderRadius: theme.radii.md, borderWidth: theme.borderWidths.hairline, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  sectionTitle: { color: theme.colors.text, fontSize: theme.typography.section, fontFamily: theme.typography.extraBold, textAlign: 'auto' },
  description: { color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.fontFamily, textAlign: 'auto' },
  step: { minHeight: theme.sizes.touch, paddingHorizontal: theme.spacingScale.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: theme.spacingScale.xs, borderRadius: theme.radii.sm, backgroundColor: theme.colors.background },
  stepText: { flex: 1, color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  stepDone: { color: theme.colors.success },
  heroBalanceRow: { width: '100%', flexDirection: 'row', direction: 'rtl', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  heroBalanceLabel: { flexShrink: 0, color: theme.colors.onPrimary, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto', writingDirection: 'rtl' },
  heroAmount: { color: theme.colors.onPrimary, fontFamily: theme.typography.extraBold },
  heroCollected: { width: '100%', paddingTop: theme.spacingScale.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: theme.borderWidths.hairline, borderTopColor: theme.colors.dividerOnHero },
  heroCollectedLabel: { color: theme.colors.heroMuted, fontSize: theme.typography.small, fontFamily: theme.typography.medium },
  heroCollectedAmount: { color: theme.colors.heroMuted, fontFamily: theme.typography.bold },
  heroAdjustment: { alignSelf: 'flex-end', minHeight: theme.sizes.touch - theme.spacingScale.xs, justifyContent: 'center' },
  heroAdjustmentText: { color: theme.colors.onPrimary, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'auto' },
  statsRow: { flexDirection: 'row', gap: theme.spacingScale.cardGap },
  statCard: { flex: 1 },
  progressCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  progressInfo: { flex: 1, alignItems: 'flex-end', gap: theme.spacingScale.xs },
  quickSection: { gap: theme.spacingScale.xs },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  quickAction: { flex: 1, minHeight: theme.sizes.quickActionHeight, alignItems: 'center', justifyContent: 'center', gap: theme.spacingScale.xs, paddingHorizontal: theme.spacingScale.xs, borderRadius: theme.radii.md, backgroundColor: theme.colors.surface, borderWidth: theme.borderWidths.hairline, borderColor: theme.colors.border },
  quickIcon: { width: theme.sizes.avatar, height: theme.sizes.avatar, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.pill, backgroundColor: theme.colors.successBackground },
  quickLabel: { color: theme.colors.text, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'center' },
  link: { color: theme.colors.primary, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  inlineEmpty: { gap: theme.spacingScale.xs },
  specialScroll: { gap: theme.spacingScale.xs, paddingVertical: theme.spacingScale.xs },
  specialCard: { width: theme.sizes.specialCardWidth, minHeight: theme.sizes.collectionCard, justifyContent: 'center', gap: theme.spacingScale.xs },
  specialTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  unpaidRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs, borderRadius: theme.radii.md },
  unpaidInfo: { flex: 1, alignItems: 'flex-end', gap: theme.spacingScale.xs },
  apartmentAvatar: { minWidth: theme.sizes.avatar, height: theme.sizes.avatar, paddingHorizontal: theme.spacingScale.xs, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.pill, backgroundColor: theme.colors.unpaidBackground },
  apartmentAvatarText: { color: theme.colors.danger, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  itemTitle: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  payButton: { minHeight: theme.sizes.touch, minWidth: theme.sizes.minActionWidth, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.sm, backgroundColor: theme.colors.primary },
  payText: { color: theme.colors.onPrimary, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  backup: { minHeight: theme.sizes.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: theme.spacingScale.xs, backgroundColor: theme.colors.warningBackground },
  backupText: { flex: 1, color: theme.colors.warning, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'auto' },
});
