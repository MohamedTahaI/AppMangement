import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { getSetting, setSetting } from '@/db/settings';
import { listApartments } from '@/db/apartments';
import { useMotion } from '@/hooks/useMotion';
import { arabicErrorMessage } from '@/services/errors';
import { getSyncStatus, type SyncStatus } from '@/services/sync';
import { DRAWER_SIDE } from '@/theme/nav';
import { theme } from '@/theme';

interface DrawerContextValue {
  openDrawer: () => void;
  closeDrawer: () => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

interface DrawerLink {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  route?: Href;
  action?: 'reduce-motion';
}

const GROUPS: { title: string; links: DrawerLink[] }[] = [
  { title: 'الرئيسية', links: [{ label: 'الرئيسية', icon: 'home', route: '/(tabs)' }] },
  {
    title: 'التحصيل',
    links: [
      { label: 'الاشتراك الشهري', icon: 'payments', route: '/(tabs)/collection' },
      { label: 'التحصيلات الخاصة', icon: 'account-balance-wallet', route: '/specials' },
      { label: 'المتأخرين', icon: 'warning-amber', route: '/overdue' },
    ],
  },
  {
    title: 'المصروفات',
    links: [
      { label: 'مصروفات الشهر', icon: 'receipt-long', route: '/(tabs)/expenses' },
      { label: 'أنواع المصروفات', icon: 'category', route: '/expense-categories' },
    ],
  },
  {
    title: 'التقارير',
    links: [
      { label: 'كشف الشهر', icon: 'summarize', route: '/month-statement' },
      { label: 'سجل العمليات', icon: 'history', route: '/ledger' },
    ],
  },
  {
    title: 'الإدارة',
    links: [
      { label: 'الشقق', icon: 'apartment', route: '/apartments' },
      { label: 'قيمة الاشتراك الشهري', icon: 'price-change', route: '/fee' },
      { label: 'تعديل المبلغ الكلي (تسوية)', icon: 'tune', route: '/adjustments' },
    ],
  },
  {
    title: 'البيانات',
    links: [
      { label: 'تصدير التقارير', icon: 'file-download', route: '/export-backup' },
      { label: 'نسخة احتياطية واستعادة', icon: 'backup', route: '/export-backup' },
      { label: 'الجدول الأونلاين', icon: 'cloud-sync', route: '/sync' },
    ],
  },
  {
    title: 'الإعدادات',
    links: [
      { label: 'بيانات العمارة', icon: 'business', route: '/building' },
      { label: 'تقليل الحركة', icon: 'motion-photos-off', action: 'reduce-motion' },
      { label: 'رقم سري', icon: 'lock', route: '/app-pin' },
    ],
  },
];

function syncLabel(status: SyncStatus): string {
  if (status.state === 'unbound') return 'غير مربوط';
  if (status.state === 'failed') return 'فشل';
  if (status.state === 'waiting') return 'في انتظار التحديث';
  return 'متزامن';
}

function normalizeRoute(route: string): string {
  const normalized = route.replace(/\/\([^/]+\)/g, '');
  return normalized || '/';
}

export function useDrawer(): DrawerContextValue {
  const context = useContext(DrawerContext);
  if (!context) throw new Error('useDrawer must be used inside DrawerProvider.');
  return context;
}

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [buildingName, setBuildingName] = useState('');
  const [apartmentCount, setApartmentCount] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: 'unbound',
    lastSyncedAt: null,
    error: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [drawerWidth, setDrawerWidth] = useState<number>(theme.sizes.drawerWidth);
  const [translateX] = useState(() => new Animated.Value(-theme.sizes.drawerMaxWidth));

  const openDrawer = useCallback(() => {
    setVisible(true);
    Animated.timing(translateX, {
      toValue: 0,
      duration: motion.enabled ? motion.durations.normal : 0,
      useNativeDriver: true,
    }).start();
  }, [motion.durations.normal, motion.enabled, translateX]);

  const closeDrawer = useCallback(() => {
    Animated.timing(translateX, {
      toValue: -drawerWidth,
      duration: motion.enabled ? motion.durations.normal : 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  }, [drawerWidth, motion.durations.normal, motion.enabled, translateX]);

  const reload = useCallback(async () => {
    try {
      const [name, apartments, status] = await Promise.all([
        getSetting('building_name'),
        listApartments(),
        getSyncStatus(),
      ]);
      setBuildingName(name ?? '');
      setApartmentCount(apartments.length);
      setReduceMotion((await getSetting('reduce_motion')) === '1');
      setSyncStatus(status);
      setError(null);
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل بيانات القائمة.'));
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (visible) void reload();
  }, [reload, visible]));

  const edgeSwipe = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (event, gesture) =>
      DRAWER_SIDE === 'left' && event.nativeEvent.pageX <= 28 && gesture.dx > 18
      && Math.abs(gesture.dy) < 30,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx > 50) openDrawer();
    },
  }), [openDrawer]);

  const value = useMemo(() => ({ openDrawer, closeDrawer }), [closeDrawer, openDrawer]);

  const activateLink = (link: DrawerLink) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (link.action === 'reduce-motion') {
      const next = !reduceMotion;
      void setSetting('reduce_motion', next ? '1' : '0')
        .then(() => setReduceMotion(next))
        .catch((saveError: unknown) => setError(arabicErrorMessage(saveError, 'تعذر حفظ الإعداد.')));
      return;
    }
    if (!link.route) return;
    closeDrawer();
    router.push(link.route);
  };

  return (
    <DrawerContext.Provider value={value}>
      <View style={styles.root} {...edgeSwipe.panHandlers}>
        <View style={[styles.appHeader, { height: 58 + insets.top, paddingTop: insets.top }]}>
          <MenuButton />
          <Text numberOfLines={1} style={styles.appHeaderTitle}>
            {buildingName || 'مدير العمارة'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`حالة المزامنة: ${syncLabel(syncStatus)}${syncStatus.error ? `: ${syncStatus.error}` : ''}`}
            onPress={() => router.push('/sync')}
            style={styles.headerSync}>
            <View style={[
              styles.syncDot,
              syncStatus.state === 'synced' && styles.synced,
              syncStatus.state === 'waiting' && styles.waiting,
              syncStatus.state === 'failed' && styles.failed,
            ]} />
          </Pressable>
        </View>
        <SafeAreaView
          edges={segments[0] === '(tabs)' ? [] : ['bottom']}
          style={styles.mainContent}>
          {children}
        </SafeAreaView>
        {visible ? (
          <View style={styles.layer}>
            <Pressable accessibilityLabel="إغلاق القائمة" onPress={closeDrawer} style={styles.scrim} />
            <Animated.View
              onLayout={(event) => setDrawerWidth(event.nativeEvent.layout.width)}
              style={[styles.drawer, { transform: [{ translateX }] }]}>
              <ScrollView contentContainerStyle={[styles.drawerContent, { paddingBottom: insets.bottom + theme.spacingScale.md }]}>
                <LinearGradient
                  colors={[theme.colors.heroStart, theme.colors.heroEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.drawerHeader, { paddingTop: insets.top + theme.spacingScale.md }]}>
                  <Text style={styles.buildingName}>{buildingName || 'مدير العمارة'}</Text>
                  <Text style={styles.headerMeta}>{apartmentCount} شقة</Text>
                  <View style={styles.syncLine}>
                    <View style={[
                      styles.syncDot,
                      syncStatus.state === 'synced' && styles.synced,
                      syncStatus.state === 'waiting' && styles.waiting,
                      syncStatus.state === 'failed' && styles.failed,
                    ]} />
                    <Text style={styles.headerMeta}>{syncLabel(syncStatus)}</Text>
                    {syncStatus.error ? <Text style={styles.headerMeta}>{syncStatus.error}</Text> : null}
                  </View>
                </LinearGradient>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {GROUPS.map((group) => (
                  <View key={group.title} style={styles.group}>
                    <Text style={styles.groupTitle}>{group.title}</Text>
                    {group.links.map((link) => {
                      const active = Boolean(link.route && normalizeRoute(String(link.route)) === normalizeRoute(pathname));
                      return (
                        <Pressable
                          key={link.label}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => activateLink(link)}
                          style={[styles.link, active && styles.linkActive]}>
                          <MaterialIcons name={link.icon} size={24} color={active ? theme.colors.primary : theme.colors.secondaryText} />
                          <Text style={[styles.linkText, active && styles.linkTextActive]}>{link.label}</Text>
                          {link.action === 'reduce-motion' ? (
                            <Switch
                              value={reduceMotion}
                              onValueChange={() => activateLink(link)}
                              trackColor={{ true: theme.colors.primary }}
                              accessibilityLabel="تقليل الحركة"
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          </View>
        ) : null}
      </View>
    </DrawerContext.Provider>
  );
}

export function MenuButton({ color = theme.colors.text }: { color?: string }) {
  const { openDrawer } = useDrawer();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="فتح القائمة"
      hitSlop={12}
      onPress={openDrawer}
      style={styles.menuButton}>
      <MaterialIcons name="menu" size={27} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  appHeader: {
    paddingHorizontal: theme.spacingScale.xs,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderBottomWidth: theme.borderWidths.hairline,
    borderBottomColor: theme.colors.border,
    direction: 'ltr',
  },
  appHeaderTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontFamily: theme.typography.bold,
    textAlign: 'center',
  },
  headerSync: { width: theme.sizes.avatar, height: theme.sizes.iconBadge, alignItems: 'center', justifyContent: 'center' },
  mainContent: { flex: 1, backgroundColor: theme.colors.background },
  layer: { ...StyleSheet.absoluteFill, zIndex: 100 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: theme.colors.overlay },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '84%',
    maxWidth: theme.sizes.drawerMaxWidth,
    backgroundColor: theme.colors.background,
    borderTopRightRadius: theme.radii.md,
    borderBottomRightRadius: theme.radii.md,
    elevation: theme.shadows.drawer.elevation,
  },
  drawerContent: { paddingBottom: theme.spacingScale.md },
  drawerHeader: {
    paddingHorizontal: theme.spacingScale.md,
    paddingBottom: theme.spacingScale.md,
    gap: theme.spacingScale.xs,
  },
  buildingName: { color: theme.colors.onPrimary, fontSize: theme.typography.heading, fontFamily: theme.typography.extraBold, textAlign: 'right' },
  headerMeta: { color: theme.colors.onPrimary, fontSize: theme.typography.small, fontFamily: theme.typography.medium, textAlign: 'right' },
  syncLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: theme.spacingScale.xs },
  syncDot: { width: 10, height: 10, borderRadius: theme.radii.pill, backgroundColor: theme.colors.unbound },
  synced: { backgroundColor: theme.colors.success },
  waiting: { backgroundColor: theme.colors.warning },
  failed: { backgroundColor: theme.colors.danger },
  group: { paddingHorizontal: theme.spacingScale.xs, paddingTop: theme.spacingScale.sm },
  groupTitle: { paddingHorizontal: theme.spacingScale.xs, paddingBottom: theme.spacingScale.xs, color: theme.colors.muted, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'left' },
  link: { minHeight: theme.sizes.touch, borderRadius: theme.radii.sm, paddingHorizontal: theme.spacingScale.xs, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: theme.spacingScale.xs },
  linkActive: { backgroundColor: theme.colors.paidBackground },
  linkText: { flex: 1, color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.medium, textAlign: 'right' },
  linkTextActive: { color: theme.colors.primary, fontFamily: theme.typography.bold },
  error: { marginHorizontal: theme.spacingScale.sm, marginTop: theme.spacingScale.xs, color: theme.colors.danger, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  menuButton: { width: theme.sizes.avatar, height: theme.sizes.iconBadge, alignItems: 'center', justifyContent: 'center' },
});
