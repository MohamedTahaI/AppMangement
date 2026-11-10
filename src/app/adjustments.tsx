import { SectionHeader } from '@/components/ui/SectionHeader';
import { AppText } from '@/components/ui/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { RowAction } from '@/components/ui/RowAction';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { Skeleton } from '@/components/ui/Skeleton';
import { theme } from '@/components/ui/theme';
import { addAdjustment, cancelAdjustment, listAdjustments, type Adjustment, type AdjustmentType } from '@/db/adjustments';
import { getDashboardTotals } from '@/services/billing';
import { arabicErrorMessage } from '@/services/errors';
import { formatDate, formatMoney, formatSignedMoney } from '@/utils/format';

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function AdjustmentsScreen() {
  const router = useRouter();
  const [type, setType] = useState<AdjustmentType>('increase');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(today());
  const [items, setItems] = useState<Adjustment[]>([]);
  const [collected, setCollected] = useState(0);
  const [netAdjustments, setNetAdjustments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<Adjustment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, totals] = await Promise.all([
        listAdjustments(),
        getDashboardTotals(new Date().toISOString().slice(0, 7)),
      ]);
      setItems(rows);
      setCollected(totals.totalCollected - totals.totalAdjustments);
      setNetAdjustments(totals.totalAdjustments);
      setError(null);
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل سجل تعديلات الرصيد.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const prepareAdd = () => {
    const parsedAmount = Number(amount.replaceAll(',', ''));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('أدخل مبلغاً أكبر من صفر.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('سبب تعديل الرصيد مطلوب (3 أحرف على الأقل).');
      return;
    }
    if (type === 'decrease' && parsedAmount > collected + netAdjustments) {
      setError('لا يمكن أن يجعل هذا النقص إجمالي التحصيل أقل من صفر.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('اكتب التاريخ بصيغة سنة-شهر-يوم، مثل 2026-03-15.');
      return;
    }
    setError(null);
    setConfirmAdd(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await addAdjustment({
        type,
        amount: Number(amount.replaceAll(',', '')),
        reason,
        adjustmentDate: date,
      });
      setConfirmAdd(false);
      setAmount('');
      setReason('');
      setNotice('تم حفظ تعديل الرصيد.');
      await load();
    } catch (saveError) {
      setConfirmAdd(false);
      setError(arabicErrorMessage(saveError, 'تعذر حفظ تعديل الرصيد.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmCancellation = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    setError(null);
    try {
      await cancelAdjustment(cancelTarget.id, cancelReason);
      setConfirmCancel(false);
      setCancelTarget(null);
      setCancelReason('');
      setNotice('تم إلغاء تعديل الرصيد مع الاحتفاظ به في السجل.');
      await load();
    } catch (cancelError) {
      setConfirmCancel(false);
      setError(arabicErrorMessage(cancelError, 'تعذر إلغاء تعديل الرصيد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle title="تعديل الرصيد" subtitle="استخدمها لو دخلت فلوس من بره العمارة، أو لتصحيح الرصيد، مع كتابة السبب" />
        {loading ? <Skeleton height={theme.sizes.regularCardHeight} /> : (
          <Card variant="surface" style={styles.totalCard}>
            <AppText style={styles.totalLabel}>إجمالي التحصيل الحالي</AppText>
            <AnimatedNumber value={collected + netAdjustments} suffix=" ج" size={theme.typography.number} />
            <View style={styles.totalSplit}>
              <AppText style={styles.itemDetail}>من الدفعات: {formatMoney(collected)}</AppText>
              <AppText style={styles.itemDetail}>صافي تعديلات الرصيد: {formatMoney(netAdjustments)}</AppText>
            </View>
          </Card>
        )}
        <Card style={styles.formCard}>
          <SectionHeader title="إضافة تعديل للرصيد" />
          <View style={styles.typeRow}>
            {([
              ['increase', 'زيادة'],
              ['decrease', 'نقص'],
            ] as [AdjustmentType, string][]).map(([itemType, label]) => (
              <Pressable
                key={itemType}
                accessibilityRole="button"
                onPress={() => setType(itemType)}
                style={[styles.typeButton, type === itemType && styles.typeSelected]}>
                <AppText style={[styles.typeText, type === itemType && styles.typeTextSelected]}>{label}</AppText>
              </Pressable>
            ))}
          </View>
          <FormField
            label="المبلغ"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="مثال: 200"
          />
          <FormField
            label="السبب (سيظهر للمقيمين في الجدول)"
            value={reason}
            onChangeText={setReason}
            placeholder="اكتب سبب تعديل الرصيد"
            maxLength={300}
          />
          <FormField
            label="التاريخ (سنة-شهر-يوم)"
            value={date}
            onChangeText={setDate}
            placeholder="2026-03-15"
            maxLength={10}
          />
          {type === 'decrease' ? (
            <AppText style={styles.warning}>
              لا يمكن أن يجعل هذا النقص إجمالي التحصيل أقل من صفر.
            </AppText>
          ) : null}
          <Card style={styles.previewCard}>
            <AppText style={styles.itemDetail}>المبلغ الكلي سيصبح</AppText>
            <AnimatedNumber
              value={collected + netAdjustments + (type === 'increase' ? 1 : -1) * (Number(amount.replaceAll(',', '')) || 0)}
              suffix=" ج"
              size={theme.sizes.icon}
            />
          </Card>
          {reason.trim().length < 3 ? <AppText style={styles.hint}>اكتب سبباً من 3 أحرف على الأقل لتفعيل الحفظ.</AppText> : null}
          <BigButton
            title={busy ? 'جارٍ الحفظ...' : 'حفظ تعديل الرصيد'}
            disabled={busy || reason.trim().length < 3}
            onPress={prepareAdd}
          />
        </Card>

        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        {notice ? <AppText style={styles.success}>{notice}</AppText> : null}
        <SectionHeader title="سجل تعديلات الرصيد" />
        {items.length === 0 ? (
          <Card><AppText style={styles.empty}>لا توجد تعديلات على الرصيد حتى الآن.</AppText></Card>
        ) : items.map((item) => (
          <Card key={item.id} style={styles.itemCard}>
            <View style={styles.itemTop}>
              <View
                style={[
                  styles.itemIcon,
                  {
                    backgroundColor: item.type === 'increase'
                      ? theme.colors.successBackground
                      : theme.colors.dangerBackground,
                  },
                ]}>
                <MaterialIcons
                  name={item.type === 'increase' ? 'north' : 'south'}
                  size={22}
                  color={item.type === 'increase' ? theme.colors.success : theme.colors.danger}
                />
              </View>
              <AppText
                numberOfLines={1}
                style={[
                  styles.itemAmount,
                  { color: item.type === 'increase' ? theme.colors.success : theme.colors.danger },
                ]}>
                {formatSignedMoney(item.type === 'increase' ? item.amount : -item.amount)}
              </AppText>
            </View>
            <AppText numberOfLines={2} style={styles.itemDetail}>السبب: {item.reason}</AppText>
            <AppText style={styles.itemDetail}>
              {formatDate(item.adjustment_date)}{item.status === 'cancelled' ? ' · ملغى' : ''}
            </AppText>
            {item.status === 'cancelled' ? (
              item.cancel_reason ? (
                <AppText numberOfLines={2} style={styles.itemDetail}>
                  سبب الإلغاء: {item.cancel_reason}
                </AppText>
              ) : null
            ) : (
              <>
                {cancelTarget?.id === item.id ? (
                  <FormField
                    label="سبب الإلغاء"
                    value={cancelReason}
                    onChangeText={setCancelReason}
                    placeholder="اكتب سبب الإلغاء"
                    maxLength={300}
                  />
                ) : null}
                <RowAction
                  label={cancelTarget?.id === item.id ? 'تأكيد إلغاء تعديل الرصيد' : 'إلغاء تعديل الرصيد'}
                  icon={cancelTarget?.id === item.id ? 'check' : 'undo'}
                  variant="danger"
                  disabled={busy}
                  onPress={() => {
                    if (cancelTarget?.id !== item.id) {
                      setCancelTarget(item);
                      setCancelReason('');
                      return;
                    }
                    if (cancelReason.trim().length < 3) {
                      setError('سبب الإلغاء مطلوب (3 أحرف على الأقل).');
                      return;
                    }
                    setConfirmCancel(true);
                  }}
                />
              </>
            )}
          </Card>
        ))}
      </ScrollView>

      <ConfirmDialog
        visible={confirmAdd}
        title="تأكيد حفظ تعديل الرصيد"
        message={`سيظهر سبب تعديل الرصيد «${reason.trim()}» للمقيمين في الجدول. هل تريد حفظ ${type === 'increase' ? 'زيادة' : 'نقص'} بمبلغ ${formatMoney(Number(amount.replaceAll(',', '')))}؟`}
        confirmLabel="حفظ"
        onConfirm={() => void save()}
        onCancel={() => setConfirmAdd(false)}
      />
      <ConfirmDialog
        visible={confirmCancel}
        title="تأكيد إلغاء تعديل الرصيد"
        message={`سيبقى السجل ظاهراً بحالة «ملغى». سبب الإلغاء: ${cancelReason.trim()}`}
        confirmLabel="إلغاء التعديل"
        destructive
        onConfirm={() => void confirmCancellation()}
        onCancel={() => setConfirmCancel(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: theme.spacingScale.screen,
    paddingTop: theme.spacingScale.md,
    paddingBottom: theme.spacingScale.lg,
    gap: theme.spacingScale.sm,
    backgroundColor: theme.colors.background,
    writingDirection: 'rtl',
  },
  back: { minHeight: theme.sizes.touchCompact, alignSelf: 'flex-start', justifyContent: 'center' },
  backText: { color: theme.colors.primary, fontSize: theme.typography.body, fontFamily: theme.typography.bold },
  formCard: { gap: theme.spacingScale.sm },
  totalCard: { alignItems: 'flex-end', gap: theme.spacingScale.xs },
  totalLabel: { color: theme.colors.secondaryText, fontSize: theme.typography.body, textAlign: 'auto' },
  totalSplit: { width: '100%', gap: theme.spacingScale.xs },
  previewCard: { alignItems: 'flex-end', paddingVertical: theme.spacingScale.xs, gap: theme.spacingScale.xs, backgroundColor: theme.colors.paidBackground },
  hint: { color: theme.colors.secondaryText, fontSize: theme.typography.small, textAlign: 'auto' },
  sectionTitle: { color: theme.colors.text, fontSize: theme.typography.heading, fontFamily: theme.typography.extraBold, textAlign: 'auto' },
  typeRow: { flexDirection: 'row', gap: theme.spacingScale.xs },
  typeButton: {
    flex: 1,
    minHeight: theme.sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  typeSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  typeText: { color: theme.colors.text, fontSize: theme.typography.section, fontFamily: theme.typography.bold },
  typeTextSelected: { color: theme.colors.surface },
  warning: { color: theme.colors.warning, fontSize: theme.typography.body, textAlign: 'auto' },
  error: { color: theme.colors.danger, fontSize: theme.typography.body, textAlign: 'auto' },
  success: { color: theme.colors.success, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto' },
  empty: { color: theme.colors.secondaryText, fontSize: theme.typography.body, textAlign: 'auto' },
  itemCard: { gap: theme.spacingScale.xs },
  itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  itemIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
  },
  itemAmount: { flexShrink: 1, fontSize: theme.typography.section, fontFamily: theme.typography.extraBold, textAlign: 'auto' },
  itemDetail: { color: theme.colors.secondaryText, fontSize: theme.typography.small, textAlign: 'auto' },
});
