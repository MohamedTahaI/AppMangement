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
import { buildReportTables } from './reportTables';
import { buildSheetSnapshot, buildSheetSyncPayload, findPendingChanges, snapshotSyncState } from './sheetRows';
import { pingMessage, pingSheet, SheetError } from './sync';
import { unzipSync, strFromU8 } from 'fflate';

import type { SQLiteDatabase } from 'expo-sqlite';

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

function fixedFetch(status: number, body: string): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  })) as unknown as typeof fetch;
}

function failingFetch(message: string): typeof fetch {
  return (async () => {
    throw new TypeError(message);
  }) as unknown as typeof fetch;
}

/**
 * Points sheet_url/sheet_secret at a throw-away endpoint and swaps the global
 * fetch for `respond`, then restores both. Written straight to SQL so the
 * ping tests never mark the database dirty.
 */
async function withSheetTransport(
  db: SQLiteDatabase,
  respond: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const keys = ['sheet_url', 'sheet_secret'];
  const savedRows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ('sheet_url', 'sheet_secret')`,
  );
  const saved = new Map(savedRows.map((row) => [row.key, row.value]));
  const originalFetch = globalThis.fetch;
  try {
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES ('sheet_url', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['https://script.google.com/macros/s/TEST_KEY/exec'],
    );
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES ('sheet_secret', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['TEST_SECRET'],
    );
    globalThis.fetch = respond;
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      const value = saved.get(key);
      if (value === undefined) {
        await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
      } else {
        await db.runAsync(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, value],
        );
      }
    }
  }
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
        const reportTables = buildReportTables(report);
        const pdfHtml = buildReportPdfHtml(report);
        const workbook = buildReportWorkbook(report);
        const workbookFiles = unzipSync(writeReportWorkbook(report));
        const sheetSnapshot = buildSheetSnapshot(report);
        const summarySheet = workbook.Sheets['الملخص'] as Record<string, { v?: unknown } | undefined> | undefined;
        const summaryTab = sheetSnapshot.tabs.find((tab) => tab.key === 'summary');
        const summaryRows = summaryTab?.rows ?? [];

        // The summary is read by label so its layout can change without breaking the test.
        const excelSummary = new Map<string, unknown>();
        for (const [address, cell] of Object.entries(summarySheet ?? {})) {
          const match = /^A(\d+)$/.exec(address);
          if (!match) continue;
          excelSummary.set(String(cell?.v ?? ''), summarySheet?.[`B${match[1]}`]?.v);
        }
        const sheetSummary = new Map(
          summaryRows.map((tableRow) => [String(tableRow.values[0]), tableRow.values[1]]),
        );

        assert(String(summaryRows[0]?.values[0]) === 'اسم العمارة', 'اسم العمارة ليس أول صف في الملخص.');
        assert(String(summaryRows[1]?.values[0]) === 'الفترة', 'الفترة ليست ثانياً في الملخص.');
        assert(String(summaryRows[2]?.values[0]) === 'تاريخ إنشاء التقرير', 'تاريخ الإنشاء ليس ثالثاً في الملخص.');
        assert(summaryRows.length >= 13, 'صفوف الملخص أقل من 13 صفاً.');

        const totals: [string, number][] = [
          ['إجمالي التحصيل', report.summary.collected],
          ['تحصيلات خاصة', report.summary.specialCollected],
          ['تعديلات الرصيد', report.summary.adjustments],
          ['إجمالي المصروفات', report.summary.totalExpenses],
          ['الرصيد', report.summary.balance],
        ];
        for (const [label, total] of totals) {
          assert(Number(excelSummary.get(label)) === total, `إجمالي Excel «${label}» لا يطابق بيانات التقرير.`);
          assert(Number(sheetSummary.get(label)) === total, `إجمالي الجدول «${label}» لا يطابق بيانات التقرير.`);
          assert(
            pdfHtml.includes(total.toLocaleString('en-US', { maximumFractionDigits: 2 })),
            `إجمالي PDF «${label}» غير موجود في التقرير.`,
          );
        }
        assert(
          sheetSnapshot.tabs.length === 11,
          'عدد جداول الجدول الأونلاين لا يساوي 11.',
        );
        assert(
          sheetSnapshot.tabs.find((tab) => tab.key === 'apartmentStatus')?.rows.length === report.apartments.length,
          'قائمة الشقق في الجدول غير مكتملة.',
        );

        const filterKeys = reportTables.filter((table) => table.hasFilter).map((table) => table.key);
        assert(
          JSON.stringify(filterKeys) === JSON.stringify(['apartmentStatus', 'payments', 'specialDetails', 'expenses']),
          'الفلتر موجود في جداول غير مطلوبة أو ناقص من جدول مطلوب.',
        );
        assert(!reportTables.find((table) => table.key === 'summary')?.hasFilter, 'ورقة الملخص بها فلتر.');

        const generatedSheets = Object.keys(workbookFiles)
          .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
          .sort((left, right) => Number(/sheet(\d+)/.exec(left)?.[1]) - Number(/sheet(\d+)/.exec(right)?.[1]))
          .map((path) => strFromU8(workbookFiles[path]));
        assert(generatedSheets.length === 11, 'عدد أوراق ملف Excel ليس 11.');
        assert(
          generatedSheets.every((xml) => xml.includes('rightToLeft="1"') && xml.includes('state="frozen"')),
          'اتجاه RTL أو تجميد صف العناوين غير موجود في ملف Excel.',
        );
        assert(
          generatedSheets.filter((xml) => xml.includes('<autoFilter')).length === 4,
          'عدد أوراق الفلتر في ملف Excel ليس 4.',
        );
        assert(!generatedSheets[0].includes('<autoFilter'), 'ورقة الملخص في ملف Excel بها فلتر.');
        assert(
          strFromU8(workbookFiles['xl/styles.xml']).includes('<b'),
          'تنسيق العناوين العريض غير موجود في ملف Excel.',
        );
        for (const table of reportTables) {
          if (table.key === 'summary') continue;
          assert(
            table.moneyColumns.length === 0 || table.totalColumns.length > 0,
            `جدول ${table.name} بلا صف إجمالي.`,
          );
        }
        const savedState = new Map(
          snapshotSyncState(sheetSnapshot).reduce((byTab, row) => {
            const rows = byTab.get(row.tabKey) ?? new Map<string, string>();
            rows.set(row.rowKey, row.hash);
            byTab.set(row.tabKey, rows);
            return byTab;
          }, new Map<string, Map<string, string>>()),
        );
        assert(findPendingChanges(sheetSnapshot, savedState).count === 0, 'الجدول يعتبر كل الصفوف تغييرات جديدة.');
        const changedSnapshot = {
          ...sheetSnapshot,
          tabs: sheetSnapshot.tabs.map((tab) =>
            tab.key === 'summary'
              ? { ...tab, rows: tab.rows.map((row) => (row.key === 'summary:balance' ? { ...row, hash: 'changed' } : row)) }
              : tab,
          ),
        };
        assert(findPendingChanges(changedSnapshot, savedState).count === 1, 'لم يكتشف التغيير الواحد في الجدول.');
        const cloneState = () => new Map(
          [...savedState].map(([tabKey, rows]) => [tabKey, new Map(rows)] as const),
        );
        const changeState = (count: number) => {
          const state = cloneState();
          for (const change of snapshotSyncState(sheetSnapshot).slice(0, count)) {
            state.get(change.tabKey)?.set(change.rowKey, 'changed');
          }
          return state;
        };
        const unlinkedPayload = buildSheetSyncPayload(sheetSnapshot, new Map(), '', true);
        const totalSheetRows = sheetSnapshot.tabs.reduce((sum, tab) => sum + tab.rows.length, 0);
        assert(
          unlinkedPayload.tabs.reduce((sum, tab) => sum + tab.rows.length, 0) === totalSheetRows,
          'جدول غير مربوط لا يرسل كل الصفوف عند الربط.',
        );
        for (const count of [3, 2]) {
          const state = changeState(count);
          assert(
            findPendingChanges(sheetSnapshot, state).count === count,
            `عدد التغييرات المعلقة لا يساوي ${count}.`,
          );
          const payload = buildSheetSyncPayload(sheetSnapshot, state, sheetSnapshot.revision, false);
          const sentRows = payload.tabs.reduce(
            (sum, tab) => sum + tab.rows.length + tab.deletedKeys.length,
            0,
          );
          assert(sentRows === count, `أرسلت المزامنة ${sentRows} صفاً بدلاً من ${count}.`);
        }
        const monthsTable = reportTables.find((table) => table.key === 'months');
        assert(
          Boolean(monthsTable?.rows.some((tableRow) => tableRow.fills?.some(Boolean))),
          'ألوان حالات الدفع غير موجودة في جدول الأشهر.',
        );
        assert(
          (monthsTable?.totalColumns.length ?? 0) > 0,
          'جدول الأشهر بلا صف إجمالي.',
        );
        const monthlyTable = reportTables.find((table) => table.key === 'monthlySummary');
        assert(
          monthlyTable?.headers.length === 6
            && monthlyTable.rows.every((tableRow) => tableRow.values.length === 6),
          'جدول ملخص كل شهر لا يحتوي الأعمدة الستة المطلوبة.',
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

  const expectPingFailure = async (respond: typeof fetch): Promise<SheetError> => {
    let caught: unknown = null;
    await withSheetTransport(db, respond, async () => {
      try {
        await pingSheet();
      } catch (error) {
        caught = error;
      }
    });
    if (!(caught instanceof SheetError)) {
      throw new Error('لم يرمِ اختبار الاتصال خطأ مفصّل.');
    }
    return caught;
  };

  await check('اختبار الاتصال: نجاح مع استجابة صحيحة', async () => {
    await withSheetTransport(
      db,
      fixedFetch(
        200,
        JSON.stringify({
          ok: true,
          revision: 'a1b2c3d4',
          schemaVersion: 4,
          rowCounts: { summary: 13 },
          tabsMissing: [],
          needsFull: false,
        }),
      ),
      async () => {
        const ping = await pingSheet();
        assert(ping.revision === 'a1b2c3d4', `رقم النسخة ${ping.revision} بدلاً من a1b2c3d4.`);
        assert(ping.schemaVersion === 4, `إصدار المخطط ${ping.schemaVersion} بدلاً من 4.`);
        assert(ping.tabsMissing.length === 0, 'أُبلغ عن أوراق ناقصة رغم اكتمالها.');
        assert(ping.needsFull === false, 'طلب بناء الجدول رغم اكتماله.');
        const message = pingMessage(ping);
        assert(message.startsWith('الاتصال سليم'), `رسالة النجاح «${message}» لا تبدأ بالنجاح.`);
        assert(message.includes('a1b2c3d4'), `رسالة النجاح «${message}» لا تذكر رقم النسخة.`);
      },
    );
  });

  await check('اختبار الاتصال: جوجل ترجع 401', async () => {
    const failure = await expectPingFailure(
      fixedFetch(401, '<HTML><BODY>Unauthorized</BODY></HTML>'),
    );
    assert(failure.message.includes('/exec'), `الرسالة «${failure.message}» لا تشرح شرط /exec.`);
    const details = failure.details ?? '';
    assert(details.includes('401'), `التفاصيل «${details}» لا تذكر رمز 401.`);
    assert(details.includes('Unauthorized'), 'التفاصيل لا تعرض محتوى استجابة جوجل.');
  });

  await check('اختبار الاتصال: HTML بدل JSON', async () => {
    const failure = await expectPingFailure(
      fixedFetch(200, '<!DOCTYPE html><html><body>صفحة خطأ</body></html>'),
    );
    assert(
      failure.message.includes('استجابة غير متوقعة'),
      `الرسالة «${failure.message}» لا تشير إلى استجابة غير متوقعة.`,
    );
    assert(
      failure.message !== 'تعذر الاتصال بالجدول. تحقق من الإنترنت والرابط والرمز.',
      'سقطت الرسالة في الجملة العامة القديمة.',
    );
    assert((failure.details ?? '').includes('<!DOCTYPE'), 'التفاصيل لا تعرض بداية الاستجابة.');
  });

  await check('اختبار الاتصال: رمز سري خاطئ', async () => {
    const failure = await expectPingFailure(
      fixedFetch(200, JSON.stringify({ ok: false, code: 'bad_secret', error: 'رمز الاتصال غير صحيح.' })),
    );
    assert(failure.message === 'الرمز السري غير مطابق.', `الرسالة «${failure.message}» غير متوقعة.`);
  });

  await check('اختبار الاتصال: سكربت قديم بلا فرع ping', async () => {
    const failure = await expectPingFailure(
      fixedFetch(200, JSON.stringify({ ok: false, code: 'bad_action', error: 'نوع الطلب غير مدعوم.' })),
    );
    assert(failure.message.includes('قديم'), `الرسالة «${failure.message}» لا تطلب تحديث السكربت.`);
  });

  await check('اختبار الاتصال: انقطاع الإنترنت', async () => {
    const failure = await expectPingFailure(failingFetch('Network request failed'));
    assert(
      failure.message.includes('انتهت مهلة الاتصال'),
      `الرسالة «${failure.message}» لا تشير إلى انقطاع الاتصال.`,
    );
    assert(
      failure.message !== 'تعذر الاتصال بالجدول. تحقق من الإنترنت والرابط والرمز.',
      'سقطت الرسالة في الجملة العامة القديمة.',
    );
  });

  await check('اختبار الاتصال: أوراق ناقصة', async () => {
    await withSheetTransport(
      db,
      fixedFetch(
        200,
        JSON.stringify({
          ok: true,
          revision: '',
          schemaVersion: 0,
          rowCounts: {},
          tabsMissing: ['الملخص', 'الدفعات'],
          needsFull: true,
        }),
      ),
      async () => {
        const ping = await pingSheet();
        assert(ping.tabsMissing.length === 2, `عدد الأوراق الناقصة ${ping.tabsMissing.length} بدلاً من 2.`);
        assert(ping.needsFull === true, 'لم يطلب بناء الجدول رغم الأوراق الناقصة.');
        const message = pingMessage(ping);
        assert(message.includes('ناقص 2'), `رسالة النجاح «${message}» لا تذكر عدد الأوراق الناقصة.`);
      },
    );
  });

  return results;
}
