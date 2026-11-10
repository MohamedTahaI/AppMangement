import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { Skeleton } from '@/components/ui/Skeleton';
import { theme } from '@/components/ui/theme';
import { addAdjustment, cancelAdjustment, listAdjustments, type Adjustment, type AdjustmentType } from '@/db/adjustments';
import { getDashboardTotals } from '@/services/billing';
import { arabicErrorMessage } from '@/services/errors';

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatAmount(amount: number): string {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج`;
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
      setError(arabicErrorMessage(loadError, 'تعذر تحميل سجل التسويات.'));
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
      setError('سبب التسوية مطلوب (3 أحرف على الأقل).');
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
      setNotice('تم حفظ التسوية.');
      await load();
    } catch (saveError) {
      setConfirmAdd(false);
      setError(arabicErrorMessage(saveError, 'تعذر حفظ التسوية.'));
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
      setNotice('تم إلغاء التسوية مع الاحتفاظ بها في السجل.');
      await load();
    } catch (cancelError) {
      setConfirmCancel(false);
      setError(arabicErrorMessage(cancelError, 'تعذر إلغاء التسوية.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle title="تسوية المبلغ الكلي" subtitle="زيادة أو نقص في إجمالي التحصيل" />
        {loading ? <Skeleton height={theme.sizes.regularCardHeight} /> : (
          <Card variant="surface" style={styles.totalCard}>
            <Text style={styles.totalLabel}>إجمالي التحصيل الحالي</Text>
            <AnimatedNumber value={collected + netAdjustments} suffix=" ج" size={theme.typography.number} />
            <View style={styles.totalSplit}>
              <Text style={styles.itemDetail}>من الدفعات: {formatAmount(collected)}</Text>
              <Text style={styles.itemDetail}>صافي التسويات: {formatAmount(netAdjustments)}</Text>
            </View>
          </Card>
        )}
        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>إضافة تسوية</Text>
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
                <Text style={[styles.typeText, type === itemType && styles.typeTextSelected]}>{label}</Text>
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
            placeholder="اكتب سبب التسوية"
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
            <Text style={styles.warning}>
              لا يمكن أن يجعل هذا النقص إجمالي التحصيل أقل من صفر.
            </Text>
          ) : null}
          <Card style={styles.previewCard}>
            <Text style={styles.itemDetail}>المبلغ الكلي سيصبح</Text>
            <AnimatedNumber
              value={collected + netAdjustments + (type === 'increase' ? 1 : -1) * (Number(amount.replaceAll(',', '')) || 0)}
              suffix=" ج"
              size={theme.sizes.icon}
            />
          </Card>
          {reason.trim().length < 3 ? <Text style={styles.hint}>اكتب سبباً من 3 أحرف على الأقل لتفعيل الحفظ.</Text> : null}
          <BigButton
            title={busy ? 'جارٍ الحفظ...' : 'حفظ التسوية'}
            disabled={busy || reason.trim().length < 3}
            onPress={prepareAdd}
          />
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.success}>{notice}</Text> : null}
        <Text style={styles.sectionTitle}>سجل التسويات</Text>
        {items.length === 0 ? (
          <Card><Text style={styles.empty}>لا توجد تسويات حتى الآن.</Text></Card>
        ) : items.map((item) => (
          <Card key={item.id} style={styles.itemCard}>
            <View style={styles.itemTop}>
              <View style={styles.itemTypeRow}>
                <MaterialIcons
                  name={item.type === 'increase' ? 'north' : 'south'}
                  size={theme.sizes.icon}
                  color={item.type === 'increase' ? theme.colors.success : theme.colors.danger}
                />
                <Text style={styles.itemType}>
                  {item.type === 'increase' ? 'زيادة' : 'نقص'} · {item.status === 'active' ? 'سارية' : 'ملغية'}
                </Text>
              </View>
              <Text style={styles.itemAmount}>
                {item.type === 'increase' ? '+' : '−'}{formatAmount(item.amount)}
              </Text>
            </View>
            <Text style={styles.itemDetail}>التاريخ: {item.adjustment_date}</Text>
            <Text style={styles.itemDetail}>السبب: {item.reason}</Text>
            {item.status === 'cancelled' ? (
              <Text style={styles.itemDetail}>سبب الإلغاء: {item.cancel_reason}</Text>
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
                <BigButton
                  title={cancelTarget?.id === item.id ? 'تأكيد إلغاء التسوية' : 'إلغاء التسوية'}
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
        title="تأكيد حفظ التسوية"
        message={`سيظهر سبب التسوية «${reason.trim()}» للمقيمين في الجدول. هل تريد حفظ ${type === 'increase' ? 'زيادة' : 'نقص'} بمبلغ ${formatAmount(Number(amount.replaceAll(',', '')))}؟`}
        confirmLabel="حفظ"
        onConfirm={() => void save()}
        onCancel={() => setConfirmAdd(false)}
      />
      <ConfirmDialog
        visible={confirmCancel}
        title="تأكيد إلغاء التسوية"
        message={`سيبقى السجل ظاهراً بحالة «ملغية». سبب الإلغاء: ${cancelReason.trim()}`}
        confirmLabel="إلغاء التسوية"
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
  totalLabel: { color: theme.colors.secondaryText, fontSize: theme.typography.body, textAlign: 'right' },
  totalSplit: { width: '100%', gap: theme.spacingScale.xs },
  previewCard: { alignItems: 'flex-end', paddingVertical: theme.spacingScale.xs, gap: theme.spacingScale.xs, backgroundColor: theme.colors.paidBackground },
  hint: { color: theme.colors.secondaryText, fontSize: theme.typography.small, textAlign: 'right' },
  sectionTitle: { color: theme.colors.text, fontSize: theme.typography.heading, fontFamily: theme.typography.extraBold, textAlign: 'right' },
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
  warning: { color: theme.colors.warning, fontSize: theme.typography.body, textAlign: 'right' },
  error: { color: theme.colors.danger, fontSize: theme.typography.body, textAlign: 'right' },
  success: { color: theme.colors.success, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
  empty: { color: theme.colors.secondaryText, fontSize: theme.typography.body, textAlign: 'right' },
  itemCard: { gap: theme.spacingScale.xs },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  itemTypeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacingScale.xs },
  itemType: { flex: 1, color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.extraBold, textAlign: 'right' },
  itemAmount: { color: theme.colors.primary, fontSize: theme.typography.body, fontFamily: theme.typography.extraBold, textAlign: 'right' },
  itemDetail: { color: theme.colors.secondaryText, fontSize: theme.typography.body, textAlign: 'right' },
});
