import { useEffect } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useMotion } from '@/hooks/useMotion';
import type { ChargeStatus } from '@/services/billing';
import { theme } from './theme';

const LABELS: Record<ChargeStatus, string> = {
  paid: 'مدفوع',
  partial: 'جزئي',
  unpaid: 'لم يدفع',
};

const ICONS: Record<ChargeStatus, 'check-circle' | 'schedule' | 'error-outline'> = {
  paid: 'check-circle',
  partial: 'schedule',
  unpaid: 'error-outline',
};

const BACKGROUNDS: Record<ChargeStatus, string> = {
  paid: theme.colors.paidBackground,
  partial: theme.colors.partialBackground,
  unpaid: theme.colors.unpaidBackground,
};

const COLORS: Record<ChargeStatus, string> = {
  paid: theme.colors.success,
  partial: theme.colors.warning,
  unpaid: theme.colors.danger,
};

export interface StatusChipProps {
  status: ChargeStatus;
}

export function StatusChip({ status }: StatusChipProps) {
  const motion = useMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (!motion.enabled) {
      scale.value = 1;
      return;
    }
    scale.value = 0.94;
    scale.value = withSpring(1, motion.spring);
  }, [motion, scale, status]);

  return (
    <Animated.View style={[styles.container, { backgroundColor: BACKGROUNDS[status] }, animatedStyle]}>
      <View style={styles.content}>
        <MaterialIcons name={ICONS[status]} size={theme.sizes.iconSmall} color={COLORS[status]} />
        <Text style={[styles.label, { color: COLORS[status] }]}>{LABELS[status]}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: theme.sizes.touch - theme.spacingScale.xs,
    paddingHorizontal: theme.spacingScale.xs,
    borderRadius: theme.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: theme.spacingScale.xs },
  label: {
    fontSize: theme.typography.small,
    fontFamily: theme.typography.extraBold,
    textAlign: 'center',
  },
});
