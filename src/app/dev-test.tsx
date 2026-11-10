import { useState } from 'react';
import { Redirect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { SelfTestResult } from '@/services/selfTest';
import { runSelfTest } from '@/services/selfTest';
import { arabicErrorMessage } from '@/services/errors';
import { theme } from '@/theme';

export default function DevTestScreen() {
  const [results, setResults] = useState<SelfTestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResults(await runSelfTest());
    } catch (testError) {
      setError(arabicErrorMessage(testError, 'تعذر تشغيل الاختبار. حاول مرة أخرى.'));
    } finally {
      setRunning(false);
    }
  };

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>اختبار قاعدة البيانات والتحصيل</Text>
      <Text style={styles.description}>
        يضيف الاختبار 3 شقق ورسوم شهرية بقيمة 400 ج، ثم يتحقق من الدفعات الشهرية والمقدمة والتحصيل الخاص.
      </Text>

      <Pressable
        accessibilityRole="button"
        disabled={running}
        onPress={() => void run()}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, running && styles.disabled]}>
        {running ? (
          <ActivityIndicator color={theme.colors.onPrimary} />
        ) : (
          <Text style={styles.buttonText}>شغّل الاختبار</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>فشل الاختبار: {error}</Text> : null}
      {results.map((result, index) => (
        <View
          key={`${result.name}-${index}`}
          style={[styles.result, result.passed ? styles.pass : styles.fail]}>
          <Text style={styles.resultStatus}>{result.passed ? 'نجح' : 'فشل'}</Text>
          <View style={styles.resultCopy}>
            <Text style={styles.resultName}>{result.name}</Text>
            <Text style={styles.resultDetail}>{result.detail}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: theme.spacingScale.md,
    gap: theme.spacingScale.sm,
    backgroundColor: theme.colors.background,
    writingDirection: 'rtl',
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
  description: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    lineHeight: theme.typography.lineHeightBody,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'right',
  },
  button: {
    minHeight: theme.sizes.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacingScale.md,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.65,
  },
  buttonText: {
    color: theme.colors.onPrimary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacingScale.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.hairline,
    padding: theme.spacingScale.sm,
  },
  pass: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successBackground,
  },
  fail: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBackground,
  },
  resultStatus: {
    minWidth: theme.sizes.touch,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.extraBold,
    textAlign: 'center',
  },
  resultCopy: {
    flex: 1,
    gap: theme.spacingScale.xs,
  },
  resultName: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
  resultDetail: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'right',
  },
});
