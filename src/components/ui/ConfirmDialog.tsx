import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { AppBottomSheet } from './AppBottomSheet';
import { FormField } from './FormField';
import { theme } from './theme';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  variant?: 'default' | 'danger';
  confirmDisabled?: boolean;
  input?: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder?: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'رجوع',
  destructive = false,
  variant = 'default',
  confirmDisabled = false,
  input,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isDanger = destructive || variant === 'danger';
  return (
    <AppBottomSheet
      visible={visible}
      title={title}
      snapPoints={input ? ['55%', '80%'] : ['42%']}
      onClose={onCancel}>
      <Text style={styles.message}>{message}</Text>
      {input ? (
        <FormField
          label={input.label}
          value={input.value}
          onChangeText={input.onChangeText}
          placeholder={input.placeholder}
        />
      ) : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onCancel();
          }}
          style={styles.cancel}>
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={confirmDisabled}
          onPress={() => {
            void Haptics.impactAsync(
              isDanger ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
            );
            onConfirm();
          }}
          style={[
            styles.confirm,
            isDanger && styles.danger,
            confirmDisabled && styles.disabled,
          ]}>
          <Text style={styles.confirmText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  message: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    lineHeight: theme.typography.lineHeightBody,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'right',
  },
  actions: { flexDirection: 'row', gap: theme.spacingScale.sm, marginTop: theme.spacingScale.sm },
  cancel: {
    flex: 1,
    minHeight: theme.sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.sm,
    borderColor: theme.colors.border,
    borderWidth: theme.borderWidths.hairline,
  },
  cancelText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  confirm: {
    flex: 1,
    minHeight: theme.sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primary,
  },
  danger: { backgroundColor: theme.colors.danger },
  disabled: { opacity: 0.45 },
  confirmText: {
    color: theme.colors.surface,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
});
