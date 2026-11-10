import { addApartment } from '../db/apartments';
import { setFeeRate } from '../db/fees';
import { getDatabase, markDirty } from '../db/schema';
import { setSetting } from '../db/settings';
import { arabicErrorMessage } from './errors';
import {
  createSpecialCollection,
  ensureCharge,
  getChargeSummary,
  getMonthAfter,
  getUnpaidForSpecial,
  recordPayment,
} from './billing';
import { createDatabaseBackup, restoreDatabaseBackup } from './backup';
import { getReportData } from './reportData';
import { buildReportWorkbook, writeReportWorkbook } from './reportExcel';
import { buildReportPdfHtml } from './reportPdf';
import { buildSheetRows } from './sheetRows';
import { unzipSync, strFromU8 } from 'fflate';

export interface SelfTestResult {
  name: string;
  passed: boolean;
  detail: string;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function runSelfTest(): Promise<SelfTestResult[]> {
  const db = await getDatabase();
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nextMonth = getMonthAfter(month, 1);
  const advanceMonth = getMonthAfter(month, 2);
  const savedRates = new Map<string, number | null>();
  const results: SelfTestResult[] = [];
  const runId = `${Date.now()}`;
  let apartmentIds: number[] = [];
  let specialId: number | null = null;
  let currentChargeId = 0;
  let nextChargeForSecondApartment = 0;
  let nextChargeForThirdApartment = 0;

  const check = async (name: string, test: () => Promise<void>): Promise<void> => {
    try {
      await test();
      results.push({ name, passed: true, detail: 'نجح' });
    } catch (error) {
      results.push({
        name,
        passed: false,
        detail: arabicErrorMessage(error, 'حدث خطأ أثناء تنفيذ هذا الاختبار.'),
      });
    }
  };

  try {
    for (const rateMonth of [month, nextMonth]) {
      const existing = await db.getFirstAsync<{ amount: number }>(
        'SELECT amount FROM fee_rates WHERE effective_from = ?',
        rateMonth,
      );
      savedRates.set(rateMonth, existing?.amount ?? null);
    }

    await setFeeRate(month, 400);
    await setFeeRate(nextMonth, 400);
    for (let index = 1; index <= 3; index += 1) {
      apartmentIds.push(await addApartment(`TEST-${runId}-${index}`, `اختبار ${index}`));
    }

    results.push({ name: 'إضافة 3 شقق ورسوم 400 ج', passed: true, detail: 'نجح' });
  } catch (error) {
    results.push({
      name: 'إضافة 3 شقق ورسوم 400 ج',
      passed: false,
      detail: arabicErrorMessage(error, 'تعذر تجهيز بيانات الاختبار.'),
    });
  }

  try {
    if (apartmentIds.length !== 3) {
      for (const name of [
        'دفعة جزئية',
        'توزيع دفعة على شهرين',
        'دفعة مقدمة لشهر قادم',
        'تغيير الرسوم يطبق على الأشهر اللاحقة فقط',
        'تحصيل خاص ينشئ الرسوم للشقق الثلاث',
      ]) {
        results.push({ name, passed: false, detail: 'لم يتم تجهيز بيانات الاختبار.' });
      }
    } else {
      await check('دفعة جزئية', async () => {
        currentChargeId = await ensureCharge(apartmentIds[0], month);
        await recordPayment(apartmentIds[0], [month], 150, today(), 'اختبار دفعة جزئية');
        const summary = await getChargeSummary(currentChargeId);
        assert(summary.paid === 150, `المبلغ المدفوع ${summary.paid} بدلاً من 150.`);
        assert(summary.remaining === 250, `المتبقي ${summary.remaining} بدلاً من 250.`);
        assert(summary.status === 'partial', `الحالة ${summary.status} بدلاً من partial.`);
      });

      await check('توزيع دفعة على شهرين', async () => {
        await recordPayment(apartmentIds[1], [nextMonth, month], 800, today(), 'اختبار شهرين');
        const currentCharge = await ensureCharge(apartmentIds[1], month);
        nextChargeForSecondApartment = await ensureCharge(apartmentIds[1], nextMonth);
        const [current, next] = await Promise.all([
          getChargeSummary(currentCharge),
          getChargeSummary(nextChargeForSecondApartment),
        ]);
        assert(current.paid === 400 && next.paid === 400, 'لم توزع الدفعة 400 ج على كل شهر.');
      });

      await check('دفعة مقدمة لشهر قادم', async () => {
        const chargeId = await ensureCharge(apartmentIds[2], advanceMonth);
        const before = await getChargeSummary(chargeId);
        await recordPayment(apartmentIds[2], [advanceMonth], before.due, today(), 'اختبار دفعة مقدمة');
        const after = await getChargeSummary(chargeId);
        assert(after.status === 'paid', 'لم يتم سداد الشهر القادم بالكامل.');
        assert(after.due === 400, `قيمة الدفعة المقدمة ${after.due} بدلاً من 400.`);
      });

      await check('تغيير الرسوم يطبق على الأشهر اللاحقة فقط', async () => {
        const currentForThirdApartment = await ensureCharge(apartmentIds[2], month);
        nextChargeForSecondApartment = await ensureCharge(apartmentIds[1], nextMonth);
        await setFeeRate(nextMonth, 500);
        nextChargeForThirdApartment = await ensureCharge(apartmentIds[2], nextMonth);
        const [past, existingLater, newLater] = await Promise.all([
          getChargeSummary(currentForThirdApartment),
          getChargeSummary(nextChargeForSecondApartment),
          getChargeSummary(nextChargeForThirdApartment),
        ]);
        assert(past.due === 400, `تغير رسم الشهر الحالي إلى ${past.due}.`);
        assert(existingLater.due === 400, `تغير رسم موجود سابقاً إلى ${existingLater.due}.`);
        assert(newLater.due === 500, `الرسم الجديد ${newLater.due} بدلاً من 500.`);
      });

      await check('تحصيل خاص ينشئ الرسوم للشقق الثلاث', async () => {
        specialId = await createSpecialCollection({
          title: `اختبار مصعد ${runId}`,
          amountPerApartment: 75,
          date: today(),
          note: 'بيانات اختبار مؤقتة',
        });
        const unpaid = await getUnpaidForSpecial(specialId);
        const testRows = unpaid.filter((row) => apartmentIds.includes(row.apartmentId));
        assert(testRows.length === 3, `تم العثور على ${testRows.length} من 3 رسوم.`);
        assert(testRows.every((row) => row.due === 75 && row.remaining === 75), 'قيمة التحصيل الخاص غير صحيحة.');
      });

      await check('تطابق إجماليات PDF وExcel والجدول', async () => {
        const report = await getReportData({ kind: 'month', value: month });
        const pdfHtml = buildReportPdfHtml(report);
        const workbook = buildReportWorkbook(report);
        const workbookFiles = unzipSync(writeReportWorkbook(report));
        const sheetSnapshot = buildSheetRows(report);
        const summarySheet = workbook.Sheets['الملخص'];
        const excelTotals = [
          Number(summarySheet?.B4?.v ?? NaN),
          Number(summarySheet?.B5?.v ?? NaN),
          Number(summarySheet?.B6?.v ?? NaN),
          Number(summarySheet?.B7?.v ?? NaN),
          Number(summarySheet?.B8?.v ?? NaN),
        ];
        const reportTotals = [
          report.summary.collected,
          report.summary.specialCollected,
          report.summary.adjustments,
          report.summary.totalExpenses,
          report.summary.balance,
        ];
        assert(
          reportTotals.every((total, index) => excelTotals[index] === total),
          'إجماليات Excel لا تطابق بيانات التقرير.',
        );
        assert(
          reportTotals.every((total) => pdfHtml.includes(total.toLocaleString('en-US', { maximumFractionDigits: 2 }))),
          'بعض إجماليات PDF غير موجودة في التقرير.',
        );
        assert(
          sheetSnapshot.summary.collectedFromPayments === report.summary.collected,
          'إجمالي التحصيل في الجدول لا يطابق التقرير.',
        );
        assert(
          sheetSnapshot.summary.specialCollectionsCollected === report.summary.specialCollected
            && sheetSnapshot.summary.netAdjustments === report.summary.adjustments
            && sheetSnapshot.summary.totalExpenses === report.summary.totalExpenses,
          'إجماليات الجدول لا تطابق بيانات التقرير.',
        );
        assert(
          sheetSnapshot.summary.balance === report.summary.balance,
          'الرصيد في الجدول لا يطابق التقرير.',
        );
        assert(
          sheetSnapshot.apartments.length === report.activeApartments.length,
          'قائمة الشقق النشطة في الجدول غير مكتملة.',
        );
        const generatedSheets = Object.keys(workbookFiles)
          .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
          .map((path) => strFromU8(workbookFiles[path]));
        assert(
          generatedSheets.length === 8 && generatedSheets.every((xml) => xml.includes('rightToLeft="1"') && xml.includes('state="frozen"')),
          'اتجاه RTL أو تجميد صف العناوين غير موجود في ملف Excel.',
        );
        assert(
          strFromU8(workbookFiles['xl/styles.xml']).includes('<b'),
          'تنسيق العناوين العريض غير موجود في ملف Excel.',
        );
        const emptyMonthReport = await getReportData({ kind: 'month', value: '0001-01' });
        const emptyMonthPdf = buildReportPdfHtml(emptyMonthReport);
        assert(
          emptyMonthReport.payments.length === 0 && emptyMonthReport.expenses.length === 0
            && emptyMonthPdf.includes('لا توجد بيانات في هذه الفترة.'),
          'لم ينجح إنشاء تقرير PDF لفترة فارغة.',
        );
      });

      await check('نسخة احتياطية واستعادة وإجمالي مطابق', async () => {
        const before = await getReportData({ kind: 'all' });
        const backup = await createDatabaseBackup();
        await setSetting('building_name', `تغيير مؤقت ${runId}`);
        await restoreDatabaseBackup(backup);
        const after = await getReportData({ kind: 'all' });
        assert(
          JSON.stringify(before.summary) === JSON.stringify(after.summary),
          'تغيرت الإجماليات بعد استعادة النسخة الاحتياطية.',
        );
        assert(
          JSON.stringify(before.apartments) === JSON.stringify(after.apartments),
          'تغيرت بيانات الشقق بعد استعادة النسخة الاحتياطية.',
        );
        assert(
          before.buildingName === after.buildingName,
          'لم تعد بيانات العمارة إلى حالتها السابقة بعد الاستعادة.',
        );
      });
    }
  } finally {
    try {
      await db.withTransactionAsync(async () => {
        if (specialId !== null) {
          await db.runAsync(
            'DELETE FROM payments WHERE charge_id IN (SELECT id FROM charges WHERE special_id = ?)',
            specialId,
          );
          await markDirty(db);
          await db.runAsync('DELETE FROM charges WHERE special_id = ?', specialId);
          await markDirty(db);
          await db.runAsync('DELETE FROM special_collections WHERE id = ?', specialId);
          await markDirty(db);
        }

        for (const apartmentId of apartmentIds) {
          await db.runAsync(
            'DELETE FROM payments WHERE charge_id IN (SELECT id FROM charges WHERE apartment_id = ?)',
            apartmentId,
          );
          await markDirty(db);
          await db.runAsync('DELETE FROM charges WHERE apartment_id = ?', apartmentId);
          await markDirty(db);
          await db.runAsync('DELETE FROM apartments WHERE id = ?', apartmentId);
          await markDirty(db);
        }
      });
    } finally {
      for (const [rateMonth, amount] of savedRates) {
        if (amount === null) {
          await db.runAsync('DELETE FROM fee_rates WHERE effective_from = ?', rateMonth);
          await markDirty(db);
        } else {
          await setFeeRate(rateMonth, amount);
        }
      }
    }
  }

  return results;
}
