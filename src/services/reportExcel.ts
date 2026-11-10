import * as XLSX from 'xlsx-js-style';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import type { ReportData } from './reportData';

type CellValue = string | number;
type ReportRow = Record<string, CellValue>;

interface SheetDefinition {
  name: string;
  headers: string[];
  rows: ReportRow[];
  totalKeys?: string[];
  categoryTotals?: { category: string; total: number }[];
}

const HEADER_STYLE = { font: { bold: true } };

function sections(report: ReportData): SheetDefinition[] {
  return [
    {
      name: 'الملخص',
      headers: ['البيان', 'القيمة'],
      rows: [
        { البيان: 'اسم العمارة', القيمة: report.buildingName },
        { البيان: 'الفترة', القيمة: report.periodLabel },
        { البيان: 'إجمالي التحصيل', القيمة: report.summary.collected },
        { البيان: 'تحصيلات خاصة', القيمة: report.summary.specialCollected },
        { البيان: 'تعديلات الرصيد', القيمة: report.summary.adjustments },
        { البيان: 'إجمالي المصروفات', القيمة: report.summary.totalExpenses },
        { البيان: 'الرصيد', القيمة: report.summary.balance },
        { البيان: 'الشقق التي دفعت', القيمة: `${report.summary.paidApartments} من ${report.summary.totalApartments}` },
        { البيان: 'تاريخ إنشاء التقرير', القيمة: report.generatedAt.slice(0, 10) },
      ],
    },
    {
      name: 'حالة الشقق',
      headers: ['رقم الشقة', 'اسم المالك', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة', 'الشهور المدفوعة'],
      rows: report.apartments.map((row) => ({
        'رقم الشقة': row.apartmentNumber, 'اسم المالك': row.ownerName, 'المطلوب': row.due,
        'المدفوع': row.paid, 'المتبقي': row.remaining, 'الحالة': row.status,
        'الشهور المدفوعة': row.monthsPaid.join('، '),
      })),
      totalKeys: ['المطلوب', 'المدفوع', 'المتبقي'],
    },
    {
      name: 'الدفعات',
      headers: ['التاريخ', 'رقم الشقة', 'اسم المالك', 'النوع', 'الشهر أو التحصيل', 'المبلغ', 'ملاحظة'],
      rows: report.payments.map((row) => ({
        'التاريخ': row.date, 'رقم الشقة': row.apartmentNumber, 'اسم المالك': row.ownerName,
        'النوع': row.type, 'الشهر أو التحصيل': row.monthOrCollection, 'المبلغ': row.amount, 'ملاحظة': row.note,
      })),
      totalKeys: ['المبلغ'],
    },
    {
      name: 'التحصيلات الخاصة',
      headers: ['اسم التحصيل', 'التاريخ', 'المبلغ لكل شقة', 'رقم الشقة', 'اسم المالك', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة'],
      rows: report.specialCollections.flatMap((collection) => collection.apartments.map((apartment) => ({
        'اسم التحصيل': collection.title, 'التاريخ': collection.date,
        'المبلغ لكل شقة': collection.amountPerApartment,
        'رقم الشقة': apartment.apartmentNumber, 'اسم المالك': apartment.ownerName,
        'المطلوب': apartment.due, 'المدفوع': apartment.paid, 'المتبقي': apartment.remaining, 'الحالة': apartment.status,
      }))),
    },
    {
      name: 'المصروفات',
      headers: ['التاريخ', 'النوع', 'المبلغ', 'ملاحظة', 'التحصيل المرتبط'],
      rows: report.expenses.map((row) => ({
        'التاريخ': row.date, 'النوع': row.category, 'المبلغ': row.amount,
        'ملاحظة': row.note, 'التحصيل المرتبط': row.linkedCollection,
      })),
      totalKeys: ['المبلغ'],
      categoryTotals: report.expensesByCategory,
    },
    {
      name: 'تعديل الرصيد',
      headers: ['التاريخ', 'النوع', 'المبلغ', 'السبب', 'الحالة', 'سبب الإلغاء'],
      rows: report.adjustments.map((row) => ({
        'التاريخ': row.date, 'النوع': row.type, 'المبلغ': row.amount,
        'السبب': row.reason, 'الحالة': row.status, 'سبب الإلغاء': row.cancelReason,
      })),
    },
    {
      name: 'لم يدفعوا',
      headers: ['رقم الشقة', 'اسم المالك', 'الشهور غير المدفوعة', 'إجمالي المتبقي'],
      rows: report.unpaid.map((row) => ({
        'رقم الشقة': row.apartmentNumber, 'اسم المالك': row.ownerName,
        'الشهور غير المدفوعة': row.monthsUnpaid.join('، '), 'إجمالي المتبقي': row.remaining,
      })),
    },
  ];
}

function applyHeaderAndNumericStyles(worksheet: XLSX.WorkSheet, headers: string[], rows: number): void {
  for (let column = 0; column < headers.length; column += 1) {
    const header = XLSX.utils.encode_cell({ r: 0, c: column });
    if (worksheet[header]) worksheet[header].s = HEADER_STYLE;
    for (let row = 1; row <= rows; row += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = worksheet[address];
      if (cell?.t === 'n') cell.z = '#,##0';
    }
  }
}

export function buildReportWorkbook(report: ReportData): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };

  for (const section of sections(report)) {
    const worksheet = XLSX.utils.aoa_to_sheet([section.headers]);
    if (section.rows.length > 0) {
      XLSX.utils.sheet_add_json(worksheet, section.rows, {
        skipHeader: true,
        origin: 'A2',
      });
    }

    const dataEndRow = section.rows.length + 1;
    if (section.totalKeys && section.rows.length > 0) {
      const totalRow = section.headers.map((header, index) => {
        if (index === 0) return 'الإجمالي';
        if (!section.totalKeys?.includes(header)) {
          if (section.categoryTotals && header === 'النوع') {
            return `حسب النوع: ${section.categoryTotals.map(({ category, total }) => `${category} ${total}`).join('، ')}`;
          }
          return '';
        }
        return section.rows.reduce((total, row) => total + (typeof row[header] === 'number' ? row[header] as number : 0), 0);
      });
      XLSX.utils.sheet_add_aoa(worksheet, [totalRow], { origin: `A${dataEndRow + 1}` });
    }

    const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1:A1');
    worksheet['!views'] = [{ rightToLeft: true }];
    worksheet['!cols'] = section.headers.map((header, column) => {
      const maxLength = section.rows.reduce((max, row) => {
        const key = section.headers[column];
        return Math.max(max, String(key ?? '').length, String(row[key] ?? '').length);
      }, header.length);
      return { wch: Math.min(42, Math.max(12, maxLength + 2)) };
    });
    worksheet['!autofilter'] = {
      ref: `A1:${XLSX.utils.encode_col(range.e.c)}${Math.max(1, dataEndRow)}`,
    };
    (worksheet as XLSX.WorkSheet & { '!freeze'?: object })['!freeze'] = {
      xSplit: 0,
      ySplit: 1,
      topLeftCell: 'A2',
      activePane: 'bottomLeft',
      state: 'frozen',
    };
    applyHeaderAndNumericStyles(worksheet, section.headers, range.e.r);
    if (section.totalKeys && section.rows.length > 0) {
      for (let column = 0; column <= range.e.c; column += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: range.e.r, c: column })];
        if (cell) cell.s = HEADER_STYLE;
      }
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, section.name);
  }

  const expenseSummary = XLSX.utils.aoa_to_sheet([
    ['نوع المصروف', 'الإجمالي'],
    ...report.expensesByCategory.map(({ category, total }) => [category, total]),
  ]);
  expenseSummary['!views'] = [{ rightToLeft: true }];
  expenseSummary['!cols'] = [{ wch: 28 }, { wch: 16 }];
  expenseSummary['!autofilter'] = { ref: `A1:B${Math.max(1, report.expensesByCategory.length + 1)}` };
  (expenseSummary as XLSX.WorkSheet & { '!freeze'?: object })['!freeze'] = {
    xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen',
  };
  applyHeaderAndNumericStyles(expenseSummary, ['نوع المصروف', 'الإجمالي'], report.expensesByCategory.length);
  XLSX.utils.book_append_sheet(workbook, expenseSummary, 'حسب نوع المصروف');
  return workbook;
}

export function writeReportWorkbook(report: ReportData): Uint8Array {
  const workbook = buildReportWorkbook(report);
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const files = unzipSync(new Uint8Array(output));

  for (const path of Object.keys(files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue;
    const xml = strFromU8(files[path]);
    let updated = false;
    const sheetXml = xml.replace(/<sheetView\b([^>]*?)(?:\/>|>([\s\S]*?)<\/sheetView>)/, (_match, rawAttributes: string) => {
      updated = true;
      const attributes = rawAttributes.replace(/\s+rightToLeft="[^"]*"/, '');
      return `<sheetView${attributes} rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>`;
    });
    if (!updated) throw new Error('تعذر تجهيز اتجاه وتجميد عناوين ملف Excel.');
    files[path] = strToU8(sheetXml);
  }

  return zipSync(files, { level: 6 });
}
