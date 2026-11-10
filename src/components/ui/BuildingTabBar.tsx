import { AppText } from '@/components/ui/AppText';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs/types';

import { useDrawer } from '@/components/navigation/DrawerProvider';
import { QuickAddSheet } from '@/components/navigation/QuickAddSheet';
import { theme } from '@/theme';

const TAB_ITEMS = {
  index: { label: 'الرئيسية', icon: 'home' },
  collection: { label: 'التحصيل', icon: 'payments' },
  expenses: { label: 'المصاريف', icon: 'receipt-long' },
} as const;

export function BuildingTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { openDrawer } = useDrawer();
  const [quickAddVisible, setQuickAddVisible] = useState(false);

  const pressTab = (routeKey: string, focused: boolean) => {
    const event = emitter.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!focused && !event.defaultPrevented) navigateToTab(routeKey);
  };

  const tabs = state.routes
    .map((route, index) => ({ route, index, config: TAB_ITEMS[route.name as keyof typeof TAB_ITEMS] }))
    .filter((entry) => entry.config);
  const byName = new Map(tabs.map((entry) => [entry.route.name, entry]));
  const visualOrder = [
    { type: 'tab' as const, item: byName.get('index') },
    { type: 'tab' as const, item: byName.get('collection') },
    { type: 'add' as const },
    { type: 'tab' as const, item: byName.get('expenses') },
    { type: 'drawer' as const },
  ];

  return (
    <>
      <View style={[styles.bar, { height: theme.sizes.tabBar + insets.bottom, paddingBottom: insets.bottom }]}>
        {visualOrder.map((entry) => {
          if (entry.type === 'drawer') {
            return (
              <Pressable
                key="drawer"
                accessibilityRole="button"
                accessibilityLabel="القائمة"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  openDrawer();
                }}
                style={styles.item}>
                <View style={styles.iconHolder}>
                  <MaterialIcons name="menu" size={theme.sizes.icon} color={theme.colors.secondaryText} />
                </View>
                <AppText style={styles.label}>القائمة</AppText>
              </Pressable>
            );
          }
          if (entry.type === 'add') {
            return (
              <Pressable
                key="quick-add"
                accessibilityRole="button"
                accessibilityLabel="إضافة سريعة"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setQuickAddVisible(true);
                }}
                style={styles.addButton}>
                <LinearGradient
                  colors={[theme.colors.heroStart, theme.colors.heroEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.addGradient}>
                  <MaterialIcons name="add" size={theme.sizes.iconLarge} color={theme.colors.onPrimary} />
                </LinearGradient>
              </Pressable>
            );
          }
          const item = entry.item;
          if (!item) return null;
          const focused = state.index === item.index;
          const options = descriptors[item.route.key]?.options;
          return (
            <Pressable
              key={item.route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options?.tabBarAccessibilityLabel ?? item.config.label}
              testID={options?.tabBarButtonTestID}
              onPress={() => pressTab(item.route.key, focused)}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: item.route.key })}
              style={[styles.item, focused && styles.itemActive]}>
              <View style={[styles.iconHolder, focused && styles.iconHolderActive]}>
                <MaterialIcons
                  name={item.config.icon as keyof typeof MaterialIcons.glyphMap}
                  size={theme.sizes.icon}
                  color={focused ? theme.colors.primary : theme.colors.secondaryText}
                />
              </View>
              <AppText style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                {options?.title ?? item.config.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <QuickAddSheet visible={quickAddVisible} onClose={() => setQuickAddVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: theme.sizes.tabBar,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderTopWidth: theme.borderWidths.hairline,
    borderTopColor: theme.colors.border,
    ...theme.shadows.card,
  },
  item: { width: '20%', minHeight: theme.sizes.tabBar, alignItems: 'center', justifyContent: 'center' },
  itemActive: {},
  iconHolder: { width: theme.sizes.avatar, height: theme.sizes.iconContainerHeight, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.pill },
  iconHolderActive: { backgroundColor: theme.colors.successBackground },
  label: { color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.medium, textAlign: 'center' },
  labelActive: { color: theme.colors.primary, fontFamily: theme.typography.bold },
  addButton: {
    width: '20%',
    height: theme.sizes.tabBar,
    marginTop: -theme.spacingScale.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
  },
  addGradient: { width: theme.sizes.quickAddButton, height: theme.sizes.quickAddButton, borderRadius: theme.radii.pill, alignItems: 'center', justifyContent: 'center', ...theme.shadows.floating },
});
