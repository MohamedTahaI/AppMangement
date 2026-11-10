import { AppText } from '@/components/ui/AppText';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { theme } from '@/theme';

export interface QuickAddSheetProps {
  visible: boolean;
  onClose: () => void;
}

const ACTIONS = [
  { label: 'تسجيل دفعة', icon: 'payments', route: { pathname: '/choose-apartment' } },
  { label: 'إضافة مصروف', icon: 'add-card', route: { pathname: '/(tabs)/expenses', params: { add: '1' } } },
  { label: 'تحصيل جديد', icon: 'account-balance-wallet', route: { pathname: '/specials', params: { create: '1' } } },
  {
    label: 'تعديل الرصيد',
    description: 'استخدمها لو دخلت فلوس من بره العمارة، أو لتصحيح الرصيد، مع كتابة السبب',
    icon: 'tune',
    route: { pathname: '/adjustments' },
  },
] as const;

export function QuickAddSheet({ visible, onClose }: QuickAddSheetProps) {
  const router = useRouter();

  return (
    <AppBottomSheet
      visible={visible}
      title="إضافة سريعة"
      snapPoints={['58%']}
      onClose={onClose}>
      <View style={styles.actions}>
        {ACTIONS.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              router.push(action.route);
            }}
            style={styles.action}>
            <MaterialIcons name={action.icon} size={28} color={theme.colors.primary} />
            <View style={styles.actionText}>
              <AppText style={styles.label}>{action.label}</AppText>
              {'description' in action ? <AppText style={styles.description}>{action.description}</AppText> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: theme.spacingScale.sm },
  action: {
    minHeight: theme.sizes.touch,
    paddingHorizontal: theme.spacingScale.sm,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: theme.spacingScale.sm,
  },
  actionText: { flex: 1, gap: theme.spacingScale.xs },
  label: { color: theme.colors.text, fontSize: theme.typography.section, fontFamily: theme.typography.bold, textAlign: 'auto' },
  description: { color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.fontFamily, textAlign: 'auto' },
});
