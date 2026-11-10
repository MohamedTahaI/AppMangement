import { AppText } from '@/components/ui/AppText';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet';
import { ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotion } from '@/hooks/useMotion';
import { theme } from '@/theme';

export interface AppBottomSheetProps {
  visible: boolean;
  title?: string;
  children: ReactNode;
  snapPoints?: (string | number)[];
  onClose: () => void;
  enableDynamicSizing?: boolean;
}

export function AppBottomSheet({
  visible,
  title,
  children,
  snapPoints,
  onClose,
  enableDynamicSizing = false,
}: AppBottomSheetProps) {
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const dismissingByProp = useRef(false);
  const wasVisible = useRef(false);
  const points = useMemo(() => snapPoints ?? ['55%', '90%'], [snapPoints]);
  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    [],
  );
  const modalProps: Partial<BottomSheetModalProps> = {
    enableDynamicSizing,
    snapPoints: enableDynamicSizing ? undefined : points,
  };

  useEffect(() => {
    if (visible) {
      wasVisible.current = true;
      sheetRef.current?.present();
    } else if (wasVisible.current) {
      wasVisible.current = false;
      dismissingByProp.current = true;
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      {...modalProps}
      onDismiss={() => {
        if (dismissingByProp.current) {
          dismissingByProp.current = false;
          return;
        }
        wasVisible.current = false;
        onClose();
      }}
      backdropComponent={renderBackdrop}
      topInset={insets.top}
      bottomInset={insets.bottom}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      enablePanDownToClose
      overrideReduceMotion={motion.enabled ? ReduceMotion.Never : ReduceMotion.Always}
      animationConfigs={{ duration: motion.enabled ? theme.motion.normal : 0 }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore">
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacingScale.md }]}>
        {title ? <AppText style={styles.title}>{title}</AppText> : null}
        <View style={styles.body}>{children}</View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: theme.colors.surface, borderTopStartRadius: theme.radii.sheet, borderTopEndRadius: theme.radii.sheet },
  handle: { width: theme.sizes.avatar, height: theme.sizes.handleHeight, backgroundColor: theme.colors.border },
  content: { padding: theme.spacingScale.lg, paddingBottom: theme.spacingScale.xl },
  title: {
    marginBottom: theme.spacingScale.md,
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
  },
  body: { gap: theme.spacingScale.md, writingDirection: 'rtl' },
});
