import { Tabs } from 'expo-router';

import { BuildingTabBar } from '@/components/ui/BuildingTabBar';
import { useMotion } from '@/hooks/useMotion';
import { theme } from '@/theme';

export default function TabLayout() {
  const motion = useMotion();

  return (
    <Tabs
      tabBar={(props) => <BuildingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: motion.enabled ? 'fade' : 'none',
        sceneStyle: { backgroundColor: theme.colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'الرئيسية' }} />
      <Tabs.Screen name="collection" options={{ title: 'التحصيل' }} />
      <Tabs.Screen name="expenses" options={{ title: 'المصروفات' }} />
    </Tabs>
  );
}
