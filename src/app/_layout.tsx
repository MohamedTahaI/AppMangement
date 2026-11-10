import { AppText } from '@/components/ui/AppText';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { I18nManager, Platform, Pressable, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { MaterialIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import {
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
} from '@expo-google-fonts/cairo';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';

import { BigButton } from '@/components/ui/BigButton';
import { FormField } from '@/components/ui/FormField';
import { initializeDatabase } from '@/db/schema';
import { isAppPinEnabled, verifyAppPin } from '@/services/appPin';
import { ensureMonthlyCharges } from '@/services/billing';
import { arabicErrorMessage } from '@/services/errors';
import { startAutoSync } from '@/services/sync';
import { useMotion } from '@/hooks/useMotion';
import { theme } from '@/theme';
import { DrawerProvider } from '@/components/navigation/DrawerProvider';

let hasLoggedRuntimeRTL = false;

void SplashScreen.preventAutoHideAsync();
if (Platform.OS === 'android') {
  void SystemUI.setBackgroundColorAsync(theme.colors.background).catch((error: unknown) => {
    if (__DEV__) console.log('تعذر ضبط لون خلفية نافذة التطبيق.', error);
  });
}

if (Platform.OS !== 'web') {
  I18nManager.allowRTL(true);
  I18nManager.swapLeftAndRightInRTL(true);
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  const motion = useMotion();
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Cairo_800ExtraBold,
    MaterialIcons: MaterialIcons.font.material,
  });
  const [startupError, setStartupError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pinLocked, setPinLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (__DEV__ && !hasLoggedRuntimeRTL) {
      hasLoggedRuntimeRTL = true;
      if (I18nManager.isRTL) {
        console.log('I18nManager.isRTL:', true);
      } else {
        console.warn('I18nManager.isRTL: false — أغلق Expo Go بالكامل وافتحه مجدداً لتطبيق اتجاه RTL.');
      }
    }
  }, []);

  useEffect(() => {
    if ((!fontsLoaded && !fontError) || initialized.current) return;
    initialized.current = true;
    let active = true;
    let stopAutoSync: (() => void) | undefined;
    void (async () => {
      try {
        if (fontError) throw fontError;
        await initializeDatabase();
        await ensureMonthlyCharges();
        setPinLocked(await isAppPinEnabled());
        stopAutoSync = startAutoSync();
        if (active) {
          setReady(true);
          await SplashScreen.hideAsync();
        }
      } catch (error) {
        if (active) {
          setStartupError(arabicErrorMessage(error, 'تعذر تجهيز بيانات التطبيق. أغلق التطبيق وافتحه مرة أخرى.'));
          await SplashScreen.hideAsync();
        }
      }
    })();
    return () => {
      active = false;
      stopAutoSync?.();
    };
  }, [fontError, fontsLoaded]);

  if (startupError) {
    return (
      <SafeAreaProvider>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, justifyContent: 'center', padding: theme.spacingScale.md, backgroundColor: theme.colors.background }}>
          <StatusBar style="dark" />
          <AppText
            style={{
              color: theme.colors.danger,
              fontSize: theme.typography.section,
              textAlign: 'auto',
              writingDirection: 'rtl',
              fontFamily: theme.typography.fontFamily,
            }}>
            تعذر تشغيل قاعدة البيانات: {startupError}
          </AppText>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }
  if (!ready) {
    return (
      <SafeAreaProvider>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, justifyContent: 'center', padding: theme.spacingScale.md, backgroundColor: theme.colors.background }}>
          <StatusBar style="dark" />
          <AppText style={{ color: theme.colors.text, fontSize: theme.typography.section, textAlign: 'center', fontFamily: theme.typography.fontFamily }}>جارٍ تجهيز التطبيق...</AppText>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }
  if (pinLocked) {
    return (
      <SafeAreaProvider>
        <SafeAreaView edges={['top', 'bottom']} style={styles.pinScreen}>
          <StatusBar style="dark" />
          <AppText style={styles.pinTitle}>مدير العمارة</AppText>
          <AppText style={styles.pinMessage}>اكتب رمز الدخول لفتح التطبيق</AppText>
          <FormField
            label="رمز الدخول"
            value={pin}
            onChangeText={(value) => {
              setPin(value.replace(/\D/g, '').slice(0, 4));
              setPinError(null);
            }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            autoFocus
          />
          {pinError ? <AppText style={styles.pinError}>{pinError}</AppText> : null}
          <BigButton
            title="فتح التطبيق"
            onPress={() => {
              void verifyAppPin(pin)
                .then((valid) => {
                  if (valid) {
                    setPin('');
                    setPinLocked(false);
                  } else {
                    setPinError('رمز الدخول غير صحيح. حاول مرة أخرى.');
                    setPin('');
                  }
                })
                .catch((error: unknown) => {
                  setPinError(arabicErrorMessage(error, 'تعذر التحقق من رمز الدخول.'));
                });
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <BottomSheetModalProvider>
          <DrawerProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.background },
                animation: motion.enabled
                  ? I18nManager.isRTL ? 'slide_from_left' : 'slide_from_right'
                  : 'none',
                animationDuration: motion.durations.normal,
              }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="apartments" />
              <Stack.Screen name="fee" />
              <Stack.Screen name="building" />
              <Stack.Screen name="expense-categories" />
              <Stack.Screen name="adjustments" />
              <Stack.Screen name="payment" />
              <Stack.Screen name="specials" />
              <Stack.Screen name="special-details/[id]" />
              <Stack.Screen name="overdue" />
              <Stack.Screen name="export-backup" />
              <Stack.Screen name="sync" />
              <Stack.Screen name="app-pin" />
              {__DEV__ ? <Stack.Screen name="dev-test" /> : null}
              {__DEV__ ? <Stack.Screen name="dev-ui" /> : null}
              <Stack.Screen name="choose-apartment" />
              <Stack.Screen name="apartment-account/[id]" />
              <Stack.Screen name="month-statement" />
              <Stack.Screen name="ledger" />
            </Stack>
          </DrawerProvider>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error('Unhandled route rendering error:', error, error.stack);
  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'bottom']} style={styles.pinScreen}>
        <StatusBar style="dark" />
        <AppText style={styles.pinTitle}>حدث خطأ أثناء فتح الصفحة</AppText>
        <AppText style={styles.pinMessage}>أعد المحاولة. إذا استمر الخطأ، أرسل سجل التطوير للمبرمج.</AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void retry().catch((retryError: unknown) => {
              if (__DEV__) console.error('Route retry failed:', retryError);
            });
          }}
          style={{ minHeight: theme.sizes.button, alignItems: 'center', justifyContent: 'center' }}>
          <AppText style={styles.pinError}>إعادة المحاولة</AppText>
        </Pressable>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  pinScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacingScale.md,
    gap: theme.spacingScale.sm,
    backgroundColor: theme.colors.background,
    writingDirection: 'rtl',
    fontFamily: theme.typography.fontFamily,
  },
  pinTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontFamily: theme.typography.extraBold,
    textAlign: 'center',
  },
  pinMessage: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'center',
  },
  pinError: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
});
