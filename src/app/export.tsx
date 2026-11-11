import { AppText } from '@/components/ui/AppText';
import { useState } from 'react';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Pressable, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { Card } from '@/components/ui/Card';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { MonthPicker, getCurrentMonth } from '@/components/ui/MonthPicker';
import { Screen } from '@/components/ui/Screen';
import { Section } from '@/components/ui/Section';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { theme } from '@/theme';
import { getReportData, type ReportPeriod } from '@/services/reportData';
import { buildReportPdfHtml } from '@/services/reportPdf';
import { writeReportWorkbook } from '@/services/reportExcel';
import { useRouter } from 'expo-router';

type PeriodKind = ReportPeriod['kind'];

function periodFor(kind: PeriodKind, month: string, year: number): ReportPeriod {
  if (kind === 'all') return { kind: 'all' };
  if (kind === 'year') return { kind: 'year', value: String(year) };
  return { kind: 'month', value: month };
}

function periodFileLabel(kind: PeriodKind, month: string): string {
  if (kind === 'all') return 'الكل';
  if (kind === 'year') return 'السنة';
  return month;
}

function technicalError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    return [error.message, error.stack, cause instanceof Error ? `السبب: ${cause.message}\n${cause.stack ?? ''}` : '']
      .filter(Boolean)
      .join('\n');
  }
  return String(error);
}

function arabicFailure(error: unknown, fallback: string): string {
  if (error instanceof Error && /[؀-ۿ]/u.test(error.message) && !/[A-Za-z]/u.test(error.message)) {
    return error.message;
  }
  return fallback;
}

export default function ExportScreen() {
  const router = useRouter();
  const [periodKind, setPeriodKind] = useState<PeriodKind>('month');
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(Number(getCurrentMonth().slice(0, 4)));
  const [customMonth, setCustomMonth] = useState(getCurrentMonth());
  const [customKind, setCustomKind] = useState<'month' | 'year'>('month');
  const [customPeriodApplied, setCustomPeriodApplied] = useState(false);
  const [customPeriodVisible, setCustomPeriodVisible] = useState(false);
  const currentYear = Number(getCurrentMonth().slice(0, 4));
  const [buildingName, setBuildingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const currentPeriod = () => periodFor(periodKind, month, year);
  const reportFailure = (context: string, cause: unknown, fallback: string) => {
    if (__DEV__) console.error(context, cause, technicalError(cause));
    setError(arabicFailure(cause, fallback));
    setErrorDetail(technicalError(cause));
    setDetailsOpen(false);
  };
  const chooseQuickPeriod = (kind: PeriodKind) => {
    setPeriodKind(kind);
    setCustomPeriodApplied(false);
    if (kind === 'month') setMonth(getCurrentMonth());
    if (kind === 'year') setYear(currentYear);
  };
  const openCustomPeriod = () => {
    const startingMonth = periodKind === 'month'
      ? month
      : periodKind === 'year'
        ? `${year}-01`
        : getCurrentMonth();
    setCustomMonth(startingMonth);
    setCustomKind(periodKind === 'year' ? 'year' : 'month');
    setCustomPeriodVisible(true);
  };
  const applyCustomPeriod = () => {
    setMonth(customMonth);
    setYear(Number(customMonth.slice(0, 4)));
    setPeriodKind(customKind);
    setCustomPeriodApplied(true);
    setCustomPeriodVisible(false);
  };

  const exportPdf = async () => {
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    setNotice(null);
    try {
      const data = await getReportData(currentPeriod());
      setBuildingName(data.buildingName);
      const pdf = await Print.printToFileAsync({
        html: buildReportPdfHtml(data),
        width: 595,
        height: 842,
        textZoom: 100,
        base64: true,
      });
      if (!pdf.base64) throw new Error('تعذر تجهيز ملف PDF.');
      const file = new File(Paths.cache, `تقرير-العمارة-${Date.now()}.pdf`);
      file.create({ intermediates: true, overwrite: true });
      await file.write(pdf.base64, { encoding: 'base64' });
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: 'مشاركة تقرير العمارة',
      });
      setNotice('تم تجهيز التقرير وفتح قائمة المشاركة.');
    } catch (exportError) {
      reportFailure('PDF export failed', exportError, 'تعذر حفظ التقرير PDF.');
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = async () => {
    setBusy(true);
    setError(null);
    setErrorDetail(null);
    setNotice(null);
    try {
      const report = await getReportData(currentPeriod());
      const bytes = writeReportWorkbook(report);
      const label = periodFileLabel(periodKind, month);
      const file = new File(Paths.cache, `تقرير-العمارة-${label}.xlsx`);
      file.create({ intermediates: true, overwrite: true });
      await file.write(bytes);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'مشاركة جدول البيانات',
      });
      setNotice('تم تجهيز جدول البيانات وفتح قائمة المشاركة.');
    } catch (exportError) {
      reportFailure('Excel export failed', exportError, 'تعذر إنشاء جدول البيانات.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Screen>
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle title="تصدير التقارير" subtitle="اختر فترة التقرير وصيغة التصدير" />
        <Section title="فترة التقرير">
          <Card style={styles.periodCard}>
            <View style={styles.periodOptions}>
              {([
                ['month', 'هذا الشهر'],
                ['year', 'هذه السنة'],
                ['all', 'كل الفترات'],
              ] as [PeriodKind, string][]).map(([kind, label]) => (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !customPeriodApplied && periodKind === kind }}
                  onPress={() => chooseQuickPeriod(kind)}
                  style={[styles.periodOption, !customPeriodApplied && periodKind === kind && styles.periodSelected]}>
                  <AppText style={[styles.periodText, !customPeriodApplied && periodKind === kind && styles.periodTextSelected]}>
                    {label}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={openCustomPeriod}>
              <AppText style={styles.customPeriodLink}>اختيار شهر أو سنة أخرى</AppText>
            </Pressable>
          </Card>
        </Section>
        <Section title="التقارير">
          <BigButton title={busy ? 'جارٍ التجهيز...' : 'حفظ التقرير PDF'} disabled={busy} onPress={() => void exportPdf()} />
          <BigButton title={busy ? 'جارٍ التجهيز...' : 'جدول بيانات'} variant="secondary" disabled={busy} onPress={() => void exportExcel()} />
          <AppText style={styles.note}>
            سيفتح الهاتف قائمة المشاركة، ومنها يمكنك حفظ الملف في الهاتف أو إرساله.
          </AppText>
        </Section>
        {error ? (
          <View style={styles.errorBox}>
            <AppText style={styles.error}>{error}</AppText>
            {errorDetail ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: detailsOpen }}
                  onPress={() => setDetailsOpen((open) => !open)}
                  style={styles.detailsToggle}>
                  <AppText style={styles.detailsLabel}>{detailsOpen ? 'إخفاء التفاصيل' : 'تفاصيل'}</AppText>
                </Pressable>
                {detailsOpen ? <AppText selectable style={styles.errorDetail}>{errorDetail}</AppText> : null}
              </>
            ) : null}
          </View>
        ) : null}
        {notice ? <AppText style={styles.success}>{notice}</AppText> : null}
        {buildingName ? <AppText style={styles.note}>{buildingName}</AppText> : null}
      </Screen>

      <AppBottomSheet
        visible={customPeriodVisible}
        title="اختيار شهر أو سنة"
        onClose={() => setCustomPeriodVisible(false)}>
        <SegmentedControl
          value={customKind}
          options={[
            { value: 'month', label: 'شهر' },
            { value: 'year', label: 'سنة' },
          ]}
          onChange={setCustomKind}
        />
        <MonthPicker month={customMonth} onChange={setCustomMonth} />
        <BigButton title="تطبيق الفترة" onPress={applyCustomPeriod} />
      </AppBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  periodCard: {
    gap: theme.spacingScale.sm,
  },
  periodOptions: {
    flexDirection: 'row',
    gap: theme.spacingScale.xs,
  },
  periodOption: {
    flex: 1,
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radii.sm,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
  },
  periodSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  periodText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  periodTextSelected: {
    color: theme.colors.surface,
  },
  customPeriodLink: { color: theme.colors.primary, fontSize: theme.typography.small, fontFamily: theme.typography.bold, textAlign: 'auto', textDecorationLine: 'underline' },
  note: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    writingDirection: 'rtl',
  },
  errorBox: {
    gap: theme.spacingScale.xs,
    padding: theme.spacingScale.sm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.dangerBackground,
  },
  detailsToggle: { alignSelf: 'flex-start', minHeight: theme.sizes.touchCompact, justifyContent: 'center' },
  detailsLabel: { color: theme.colors.primary, fontSize: theme.typography.body, fontFamily: theme.typography.bold },
  errorDetail: { color: theme.colors.text, fontSize: theme.typography.small, writingDirection: 'ltr' },
  success: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
});
