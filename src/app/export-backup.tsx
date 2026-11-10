import { useRouter } from 'expo-router';
import { useState } from 'react';
import { getDocumentAsync } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { MaterialIcons } from '@expo/vector-icons';
import { I18nManager, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '@/db/schema';
import { setSetting } from '@/db/settings';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MonthPicker, getCurrentMonth } from '@/components/ui/MonthPicker';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { theme } from '@/components/ui/theme';
import { createDatabaseBackup, restoreDatabaseBackup, validateDatabaseBackup, type DatabaseBackup } from '@/services/backup';
import { buildExportData, type ExportPeriod } from '@/services/exportData';
import { arabicErrorMessage } from '@/services/errors';

type PeriodKind = ExportPeriod['kind'];

function escapeHtml(value: string | number | null): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderTable(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) return '<p class="empty">لا توجد بيانات في هذه الفترة.</p>';
  const headers = Object.keys(rows[0]);
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header] ?? null)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function formatCurrency(value: string | number): string {
  if (typeof value !== 'number') return value;
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} ج`;
}

function buildPdfHtml(
  data: Awaited<ReturnType<typeof buildExportData>>,
  buildingName: string,
): string {
  const summaryRows = data.summary.map(({ label, value }) => ({
    'البند': label,
    'القيمة': label === 'الفترة' ? value : formatCurrency(value),
  }));
  return `<!doctype html>
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8">
      <style>
        body { direction: rtl; font-family: Cairo, "Noto Naskh Arabic", "Noto Sans Arabic", Tahoma, Arial, sans-serif; color: ${theme.colors.text}; padding: ${theme.spacingScale.sm}px; }
        h1 { font-size: ${theme.typography.title}px; } h2 { font-size: ${theme.typography.section}px; margin-top: ${theme.spacingScale.md}px; }
        table { width: 100%; border-collapse: collapse; margin-top: ${theme.spacingScale.xs}px; }
        th, td { border: ${theme.borderWidths.hairline}px solid ${theme.colors.border}; padding: ${theme.spacingScale.xs}px; text-align: right; font-size: ${theme.typography.small}px; }
        th { background: ${theme.colors.successBackground}; } tr:nth-child(even) { background: ${theme.colors.background}; }
        .empty { color: ${theme.colors.secondaryText}; font-size: ${theme.typography.small}px; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(buildingName || 'تقرير العمارة')}</h1>
      <p>الفترة: ${escapeHtml(data.periodLabel)}</p>
      <h2>الملخص</h2>${renderTable(summaryRows)}
      <h2>الاشتراك الشهري</h2>${renderTable(data.monthlyMatrix)}
      <h2>المصروفات</h2>${renderTable(data.expenses)}
      <h2>التسويات</h2>${renderTable(data.adjustments)}
      <h2>التحصيلات الخاصة</h2>${renderTable(data.specialCollections)}
      <h2>المتأخرون</h2>${renderTable(data.unpaid)}
    </body>
  </html>`;
}

function periodFor(kind: PeriodKind, month: string, year: number): ExportPeriod {
  if (kind === 'all') return { kind: 'all' };
  if (kind === 'year') return { kind: 'year', value: String(year) };
  return { kind: 'month', value: month };
}

export default function ExportBackupScreen() {
  const router = useRouter();
  const [periodKind, setPeriodKind] = useState<PeriodKind>('month');
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(Number(getCurrentMonth().slice(0, 4)));
  const [buildingName, setBuildingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState<DatabaseBackup | null>(null);

  const currentPeriod = () => periodFor(periodKind, month, year);

  const exportPdf = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const db = await getDatabase();
      const nameRow = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'building_name'",
      );
      const name = nameRow?.value ?? '';
      setBuildingName(name);
      const data = await buildExportData(currentPeriod());
      const pdf = await Print.printToFileAsync({
        html: buildPdfHtml(data, name),
        textZoom: 110,
      });
      await Sharing.shareAsync(pdf.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'مشاركة تقرير العمارة',
      });
      setNotice('تم تجهيز التقرير وفتح قائمة المشاركة.');
    } catch (exportError) {
      setError(arabicErrorMessage(exportError, 'تعذر إنشاء تقرير الطباعة.'));
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await buildExportData(currentPeriod());
      const workbook = XLSX.utils.book_new();
      const sheets: [string, Record<string, string | number | null>[]][] = [
        ['الملخص', data.summary.map(({ label, value }) => ({ 'البند': label, 'القيمة': value }))],
        ['الاشتراك الشهري', data.monthlyMatrix],
        ['المصروفات', data.expenses],
        ['التسويات', data.adjustments],
        ['التحصيلات الخاصة', data.specialCollections],
        ['المتأخرون', data.unpaid],
      ];
      for (const [sheetName, rows] of sheets) {
        const worksheet =
          rows.length > 0
            ? XLSX.utils.json_to_sheet(rows)
            : XLSX.utils.aoa_to_sheet([['لا توجد بيانات في هذه الفترة']]);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }
      const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const file = new File(Paths.cache, `تقرير-العمارة-${Date.now()}.xlsx`);
      file.create({ intermediates: true, overwrite: true });
      await file.write(new Uint8Array(bytes));
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'مشاركة جدول البيانات',
      });
      setNotice('تم تجهيز جدول البيانات وفتح قائمة المشاركة.');
    } catch (exportError) {
      setError(arabicErrorMessage(exportError, 'تعذر إنشاء جدول البيانات.'));
    } finally {
      setBusy(false);
    }
  };

  const createBackup = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const backup = await createDatabaseBackup();
      const file = new File(Paths.cache, `نسخة-احتياطية-العمارة-${backup.createdAt.slice(0, 10)}.json`);
      file.create({ intermediates: true, overwrite: true });
      await file.write(JSON.stringify(backup, null, 2));
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: 'حفظ نسخة احتياطية من بيانات العمارة',
      });
      await setSetting('last_backup_at', new Date().toISOString());
      setNotice('تم تجهيز النسخة الاحتياطية وفتح قائمة المشاركة.');
    } catch (backupError) {
      setError(arabicErrorMessage(backupError, 'تعذر إنشاء النسخة الاحتياطية.'));
    } finally {
      setBusy(false);
    }
  };

  const chooseBackup = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await getDocumentAsync({
        type: ['application/json', 'text/json'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('لم يتم اختيار ملف.');
      const contents = await new File(asset.uri).text();
      const validated = validateDatabaseBackup(JSON.parse(contents) as unknown);
      setPendingBackup(validated);
    } catch (restoreError) {
      setError(arabicErrorMessage(restoreError, 'الملف غير صالح أو تعذر قراءته.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (!pendingBackup) return;
    setBusy(true);
    setError(null);
    try {
      await restoreDatabaseBackup(pendingBackup);
      setPendingBackup(null);
      setNotice('تمت استعادة البيانات بنجاح. أغلق التطبيق وافتحه لتحديث كل الشاشات.');
    } catch (restoreError) {
      setError(arabicErrorMessage(restoreError, 'تعذرت استعادة النسخة. لم يتم تغيير البيانات.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle title="تصدير / باك أب" subtitle="تصدير التقارير أو حفظ واستعادة البيانات" />
        <Card style={styles.periodCard}>
          <Text style={styles.sectionTitle}>فترة التقرير</Text>
          <View style={styles.periodOptions}>
            {([
              ['month', 'شهر'],
              ['year', 'سنة'],
              ['all', 'كل البيانات'],
            ] as [PeriodKind, string][]).map(([kind, label]) => (
              <Pressable
                key={kind}
                accessibilityRole="button"
                onPress={() => setPeriodKind(kind)}
                style={[styles.periodOption, periodKind === kind && styles.periodSelected]}>
                <Text style={[styles.periodText, periodKind === kind && styles.periodTextSelected]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          {periodKind === 'month' ? (
            <MonthPicker month={month} onChange={setMonth} />
          ) : null}
          {periodKind === 'year' ? (
            <View style={styles.yearRow}>
              <Pressable onPress={() => setYear((value) => Math.max(1, value - 1))} style={styles.yearButton}>
                <MaterialIcons name={I18nManager.isRTL ? 'chevron-right' : 'chevron-left'} size={theme.sizes.iconLarge} color={theme.colors.primary} />
              </Pressable>
              <Text style={styles.year}>{year}</Text>
              <Pressable onPress={() => setYear((value) => Math.min(9999, value + 1))} style={styles.yearButton}>
                <MaterialIcons name={I18nManager.isRTL ? 'chevron-left' : 'chevron-right'} size={theme.sizes.iconLarge} color={theme.colors.primary} />
              </Pressable>
            </View>
          ) : null}
        </Card>
        <Text style={styles.sectionTitle}>التقارير</Text>
        <BigButton title={busy ? 'جارٍ التجهيز...' : 'تقرير للطباعة'} disabled={busy} onPress={() => void exportPdf()} />
        <BigButton title={busy ? 'جارٍ التجهيز...' : 'جدول بيانات'} variant="secondary" disabled={busy} onPress={() => void exportExcel()} />
        <Text style={styles.note}>
          سيفتح الهاتف قائمة المشاركة، ومنها يمكنك حفظ الملف في الهاتف أو إرساله.
        </Text>
        <Text style={styles.sectionTitle}>النسخة الاحتياطية</Text>
        <BigButton title={busy ? 'جارٍ التجهيز...' : 'حفظ نسخة احتياطية'} disabled={busy} onPress={() => void createBackup()} />
        <BigButton title={busy ? 'جارٍ الفتح...' : 'استعادة نسخة احتياطية'} variant="secondary" disabled={busy} onPress={() => void chooseBackup()} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.success}>{notice}</Text> : null}
        {buildingName ? <Text style={styles.note}>{buildingName}</Text> : null}
      </ScrollView>

      <ConfirmDialog
        visible={pendingBackup !== null}
        title="تحذير: استبدال جميع البيانات"
        message={`سيتم مسح البيانات الحالية واستبدالها بالكامل بمحتوى النسخة الاحتياطية المؤرخة ${pendingBackup?.createdAt.slice(0, 10) ?? ''}. لا يمكن التراجع عن ذلك. لا تتابع إلا إذا كنت متأكداً أن هذه هي النسخة الصحيحة.`}
        confirmLabel="استبدال كل البيانات"
        cancelLabel="إلغاء"
        destructive
        onConfirm={() => void confirmRestore()}
        onCancel={() => setPendingBackup(null)}
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
  back: {
    minHeight: theme.sizes.touchCompact,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  backText: {
    color: theme.colors.primary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  periodCard: {
    gap: theme.spacingScale.sm,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.extraBold,
    textAlign: 'right',
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
  yearRow: {
    minHeight: theme.sizes.touchCompact + theme.spacingScale.xs / 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yearButton: {
    minWidth: theme.sizes.avatar,
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
    alignItems: 'center',
  },
  year: {
    color: theme.colors.text,
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.extraBold,
  },
  note: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
  success: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
});
