import { AppText } from '@/components/ui/AppText';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AnimatedListItem } from '@/components/ui/AnimatedListItem';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { GradientCard } from '@/components/ui/GradientCard';
import { MonthPicker, getCurrentMonth, getMonthLabel } from '@/components/ui/MonthPicker';
import { MonthTransition } from '@/components/ui/MonthTransition';
import { MoneyText } from '@/components/ui/MoneyText';
import { PressableCard } from '@/components/ui/PressableCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { SuccessSheet } from '@/components/ui/SuccessSheet';
import { Toast } from '@/components/ui/Toast';
import { theme } from '@/theme';

type DemoSegment = 'first' | 'second';

export default function DevUiScreen() {
  const router = useRouter();
  const [month, setMonth] = useState(getCurrentMonth());
  const [number, setNumber] = useState(1200);
  const [segment, setSegment] = useState<DemoSegment>('first');
  const [progress, setProgress] = useState(42);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState('');
  const [chipStatus, setChipStatus] = useState<'paid' | 'partial' | 'unpaid'>('paid');
  const [buttonLoading, setButtonLoading] = useState(false);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenHeader title="تجربة عناصر الواجهة" subtitle="صفحة مؤقتة لاختبار الشكل والحركة" />

        <GradientCard>
          <AppText style={styles.heroTitle}>بطاقة متدرجة</AppText>
          <AnimatedNumber value={number} suffix=" ج" style={styles.heroNumber} />
        </GradientCard>
        <Card>
          <AppText style={styles.title}>البطاقات والمبالغ</AppText>
          <MoneyText amount={number} />
          <PressableCard
            onPress={() => setNumber((value) => value + 100)}
            cardStyle={styles.pressableCard}>
            <AppText style={styles.rowText}>اضغط لزيادة الرقم 100 ج</AppText>
          </PressableCard>
        </Card>

        <Card>
          <AppText style={styles.title}>الشهر والانتقال</AppText>
          <MonthPicker month={month} onChange={setMonth} />
          <MonthTransition month={month}>
            <AppText style={styles.rowText}>{getMonthLabel(month)}</AppText>
          </MonthTransition>
        </Card>

        <Card>
          <AppText style={styles.title}>الحالة وشريط التقدم</AppText>
          <View style={styles.statusRow}>
            <StatusChip status={chipStatus} />
            <BigButton
              title="تغيير حالة الشقة"
              variant="secondary"
              onPress={() => setChipStatus((value) => (
                value === 'paid' ? 'partial' : value === 'partial' ? 'unpaid' : 'paid'
              ))}
            />
          </View>
          <ProgressBar progress={progress} />
          <View style={styles.statusRow}>
            <ProgressRing progress={progress} />
            <BigButton
              title="تغيير التقدم"
              variant="secondary"
              onPress={() => setProgress((value) => (value + 17) % 101)}
            />
          </View>
        </Card>

        <Card>
          <AppText style={styles.title}>الأزرار والاختيار</AppText>
          <BigButton title="زر أساسي" onPress={() => setToastVisible(true)} />
          <BigButton title="زر ثانوي" variant="secondary" onPress={() => setSheetVisible(true)} />
          <BigButton title="زر خطر" variant="danger" onPress={() => setConfirmVisible(true)} />
          <BigButton
            title="حالة التحميل"
            loading={buttonLoading}
            onPress={() => {
              setButtonLoading(true);
              setTimeout(() => setButtonLoading(false), 1200);
            }}
          />
          <SegmentedControl<DemoSegment>
            value={segment}
            options={[
              { value: 'first', label: 'اختيار أول' },
              { value: 'second', label: 'اختيار ثانٍ' },
            ]}
            onChange={setSegment}
          />
        </Card>

        <Card>
          <AppText style={styles.title}>إدخال البيانات</AppText>
          <FormField
            label="حقل تجريبي"
            value={fieldValue}
            onChangeText={setFieldValue}
            placeholder="اكتب أي شيء"
            error={fieldError}
          />
          <BigButton
            title={fieldError ? 'إخفاء خطأ الحقل' : 'إظهار خطأ الحقل'}
            variant="secondary"
            onPress={() => setFieldError((value) => value ? null : 'رسالة خطأ عربية للتجربة.')}
          />
        </Card>

        <Card>
          <AppText style={styles.title}>التحميل والحالة الفارغة</AppText>
          {showSkeleton ? (
            <View style={styles.skeletonGroup}>
              <Skeleton height={theme.sizes.touch + theme.spacingScale.xs} />
              <Skeleton height={theme.sizes.touch + theme.spacingScale.xs} />
              <Skeleton height={theme.sizes.touch + theme.spacingScale.xs} />
            </View>
          ) : (
            <EmptyState message="هذا مثال على الحالة الفارغة ورسمة SVG المتحركة." />
          )}
          <BigButton
            title={showSkeleton ? 'إظهار الحالة الفارغة' : 'إظهار التحميل'}
            variant="secondary"
            onPress={() => setShowSkeleton((value) => !value)}
          />
        </Card>

        <Card>
          <AppText style={styles.title}>تأكيد ونجاح وإشعار</AppText>
          <BigButton title="فتح التأكيد" variant="danger" onPress={() => setConfirmVisible(true)} />
          <BigButton title="عرض النجاح" onPress={() => setSuccessVisible(true)} />
          <BigButton title="عرض الإشعار" variant="secondary" onPress={() => setToastVisible(true)} />
        </Card>

        <Card>
          <AppText style={styles.title}>عناصر قائمة متتابعة (50 عنصرًا)</AppText>
          {Array.from({ length: 50 }, (_, index) => (
            <AnimatedListItem key={index} index={index}>
              <View style={styles.listItem}>
                <AppText style={styles.rowText}>عنصر رقم {index + 1}</AppText>
              </View>
            </AnimatedListItem>
          ))}
        </Card>
      </ScrollView>

      <Toast
        visible={toastVisible}
        message="هذا إشعار تجريبي."
        onDismiss={() => setToastVisible(false)}
      />
      <AppBottomSheet
        visible={sheetVisible}
        title="لوحة سفلية تجريبية"
        onClose={() => setSheetVisible(false)}>
        <AppText style={styles.rowText}>اسحب لأسفل لإغلاق هذه اللوحة.</AppText>
      </AppBottomSheet>
      <ConfirmDialog
        visible={confirmVisible}
        title="تأكيد تجريبي"
        message="هذه رسالة تأكيد لاختبار شكل اللوحة."
        variant="danger"
        onConfirm={() => {
          setConfirmVisible(false);
          setSuccessVisible(true);
        }}
        onCancel={() => setConfirmVisible(false)}
      />
      <SuccessSheet
        visible={successVisible}
        amount={number}
        onDismiss={() => setSuccessVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  container: {
    flexGrow: 1,
    padding: theme.spacing,
    paddingTop: theme.spacingScale.xl,
    paddingBottom: theme.spacingScale.lg,
    gap: theme.spacing,
    writingDirection: 'rtl',
  },
  back: { minHeight: theme.sizes.touchCompact, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { color: theme.colors.primary, fontSize: theme.typography.body, fontFamily: theme.typography.bold },
  title: { color: theme.colors.text, fontSize: theme.typography.section, fontFamily: theme.typography.extraBold, textAlign: 'auto' },
  heroTitle: { color: theme.colors.onPrimary, fontSize: theme.typography.section, fontFamily: theme.typography.bold },
  heroNumber: { color: theme.colors.onPrimary, fontSize: theme.typography.number },
  rowText: { color: theme.colors.text, fontSize: theme.typography.body, textAlign: 'auto' },
  pressableCard: { backgroundColor: theme.colors.successBackground },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  skeletonGroup: { gap: theme.spacingScale.xs },
  listItem: {
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
    paddingHorizontal: theme.spacingScale.xs,
    borderBottomWidth: theme.borderWidths.hairline,
    borderBottomColor: theme.colors.border,
  },
});
