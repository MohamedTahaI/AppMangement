import type { ReportData, ReportStatus } from './reportData';

export type ReportCell = string | number;

export interface ReportTableRow {
  key: string;
  values: ReportCell[];
  fills?: (string | null)[];
}

export interface ReportTable {
  key: string;
  name: string;
  headers: string[];
  rows: ReportTableRow[];
  moneyColumns: number[];
  totalColumns: number[];
  hasFilter: boolean;
}

export const SHEET_SCHEMA_VERSION = 4;

export const REPORT_TABLE_KEYS = [
  'summary',
  'apartmentStatus',
  'months',
  'payments',
  'specials',
  'specialDetails',
  'expenses',
  'expensesByCategory',
  'adjustments',
  'unpaid',
  'monthlySummary',
] as const;

export const REPORT_TABLE_NAMES: Record<(typeof REPORT_TABLE_KEYS)[number], string> = {
  summary: 'الملخص',
  apartmentStatus: 'حالة الشقق',
  months: 'جدول الأشهر',
  payments: 'الدفعات',
  specials: 'التحصيلات الخاصة',
  specialDetails: 'تفاصيل التحصيلات الخاصة',
  expenses: 'المصروفات',
  expensesByCategory: 'المصروفات حسب النوع',
  adjustments: 'التعديلات',
  unpaid: 'المتأخرين',
  monthlySummary: 'ملخص كل شهر',
};

function statusLabel(status: ReportStatus): string {
  return status === 'دفع' ? 'مدفوع' : status;
}

function statusFill(status: ReportStatus | undefined): string | null {
  if (status === 'دفع') return 'DCFCE7';
  if (status === 'جزئي') return 'FEF3C7';
  if (status === 'لم يدفع') return 'FEE2E2';
  return null;
}

function row(key: string, values: ReportCell[], fills?: (string | null)[]): ReportTableRow {
  return fills ? { key, values, fills } : { key, values };
}

export function buildReportTables(report: ReportData): ReportTable[] {
  const monthRows = report.monthlyMatrix.flatMap((year) =>
    year.apartments.map((apartment) => {
      const months = Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, '0');
        const entry = apartment.months[month];
        return entry ? Number(entry.paid) : '';
      });
      const monthFills = Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, '0');
        return statusFill(apartment.months[month]?.status);
      });
      return row(
        `month:${year.year}:${apartment.number}`,
        [
          year.year,
          apartment.number,
          apartment.ownerName,
          ...months,
          apartment.totalPaid,
          apartment.totalRemaining,
        ],
        [null, null, null, ...monthFills, null, null],
      );
    }),
  );

  return [
    {
      key: 'summary',
      name: REPORT_TABLE_NAMES.summary,
      headers: ['البيان', 'القيمة'],
      moneyColumns: [1],
      totalColumns: [],
      hasFilter: false,
      rows: [
        row('summary:building', ['اسم العمارة', report.buildingName]),
        row('summary:period', ['الفترة', report.periodLabel]),
        row('summary:generatedAt', ['تاريخ إنشاء التقرير', report.generatedAt.slice(0, 10)]),
        row('summary:collected', ['إجمالي التحصيل', report.summary.collected]),
        row('summary:special', ['تحصيلات خاصة', report.summary.specialCollected]),
        row('summary:adjustments', ['تعديلات الرصيد', report.summary.adjustments]),
        row('summary:expenses', ['إجمالي المصروفات', report.summary.totalExpenses]),
        row('summary:balance', ['الرصيد', report.summary.balance]),
        row('summary:paidApartments', [
          'الشقق التي دفعت',
          `${report.summary.paidApartments} من ${report.summary.totalApartments}`,
        ]),
        row('summary:paymentsCount', ['عدد الدفعات', report.payments.length]),
        row('summary:expensesCount', ['عدد المصروفات', report.expenses.length]),
        row('summary:specialsCount', ['عدد التحصيلات الخاصة', report.specialCollections.length]),
        row('summary:unpaidCount', ['الشقق المتأخرة', report.unpaid.length]),
      ],
    },
    {
      key: 'apartmentStatus',
      name: REPORT_TABLE_NAMES.apartmentStatus,
      headers: ['رقم الشقة', 'اسم المالك', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة', 'الشهور المدفوعة'],
      moneyColumns: [2, 3, 4],
      totalColumns: [2, 3, 4],
      hasFilter: true,
      rows: report.apartments.map((apartment) =>
        row(`apt:${apartment.apartmentNumber}`, [
          apartment.apartmentNumber,
          apartment.ownerName,
          apartment.due,
          apartment.paid,
          apartment.remaining,
          statusLabel(apartment.status),
          apartment.monthsPaid.join('، '),
        ]),
      ),
    },
    {
      key: 'months',
      name: REPORT_TABLE_NAMES.months,
      headers: [
        'السنة',
        'رقم الشقة',
        'اسم المالك',
        ...Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')),
        'إجمالي المدفوع',
        'إجمالي المتبقي',
      ],
      moneyColumns: [...Array.from({ length: 14 }, (_, index) => index + 3)],
      totalColumns: [...Array.from({ length: 14 }, (_, index) => index + 3)],
      hasFilter: false,
      rows: monthRows,
    },
    {
      key: 'payments',
      name: REPORT_TABLE_NAMES.payments,
      headers: ['التاريخ', 'رقم الشقة', 'اسم المالك', 'النوع', 'الشهر أو التحصيل', 'المبلغ', 'ملاحظة'],
      moneyColumns: [5],
      totalColumns: [5],
      hasFilter: true,
      rows: report.payments.map((payment) =>
        row(`pay:${payment.id}`, [
          payment.date,
          payment.apartmentNumber,
          payment.ownerName,
          payment.type,
          payment.monthOrCollection,
          payment.amount,
          payment.note,
        ]),
      ),
    },
    {
      key: 'specials',
      name: REPORT_TABLE_NAMES.specials,
      headers: ['اسم التحصيل', 'التاريخ', 'المبلغ لكل شقة', 'عدد الشقق', 'المطلوب', 'المدفوع', 'المتبقي'],
      moneyColumns: [2, 4, 5, 6],
      totalColumns: [4, 5, 6],
      hasFilter: false,
      rows: report.specialCollections.map((collection) =>
        row(`special:${collection.id}`, [
          collection.title,
          collection.date,
          collection.amountPerApartment,
          collection.apartments.length,
          collection.due,
          collection.paid,
          collection.remaining,
        ]),
      ),
    },
    {
      key: 'specialDetails',
      name: REPORT_TABLE_NAMES.specialDetails,
      headers: [
        'اسم التحصيل',
        'التاريخ',
        'المبلغ لكل شقة',
        'رقم الشقة',
        'اسم المالك',
        'المطلوب',
        'المدفوع',
        'المتبقي',
        'الحالة',
      ],
      moneyColumns: [2, 5, 6, 7],
      totalColumns: [5, 6, 7],
      hasFilter: true,
      rows: report.specialCollections.flatMap((collection) =>
        collection.apartments.map((apartment) =>
          row(`special:${collection.id}:${apartment.apartmentNumber}`, [
            collection.title,
            collection.date,
            collection.amountPerApartment,
            apartment.apartmentNumber,
            apartment.ownerName,
            apartment.due,
            apartment.paid,
            apartment.remaining,
            statusLabel(apartment.status),
          ]),
        ),
      ),
    },
    {
      key: 'expenses',
      name: REPORT_TABLE_NAMES.expenses,
      headers: ['التاريخ', 'النوع', 'المبلغ', 'ملاحظة', 'التحصيل المرتبط'],
      moneyColumns: [2],
      totalColumns: [2],
      hasFilter: true,
      rows: report.expenses.map((expense) =>
        row(`expense:${expense.id}`, [
          expense.date,
          expense.category,
          expense.amount,
          expense.note,
          expense.linkedCollection,
        ]),
      ),
    },
    {
      key: 'expensesByCategory',
      name: REPORT_TABLE_NAMES.expensesByCategory,
      headers: ['نوع المصروف', 'الإجمالي'],
      moneyColumns: [1],
      totalColumns: [1],
      hasFilter: false,
      rows: report.expensesByCategory.map((category) =>
        row(`category:${category.category}`, [category.category, category.total]),
      ),
    },
    {
      key: 'adjustments',
      name: REPORT_TABLE_NAMES.adjustments,
      headers: ['التاريخ', 'النوع', 'المبلغ', 'السبب', 'الحالة', 'سبب الإلغاء'],
      moneyColumns: [2],
      totalColumns: [2],
      hasFilter: false,
      rows: report.adjustments.map((adjustment) =>
        row(`adjustment:${adjustment.id}`, [
          adjustment.date,
          adjustment.type,
          adjustment.amount,
          adjustment.reason,
          adjustment.status,
          adjustment.cancelReason,
        ]),
      ),
    },
    {
      key: 'unpaid',
      name: REPORT_TABLE_NAMES.unpaid,
      headers: ['رقم الشقة', 'اسم المالك', 'الشهور غير المدفوعة', 'إجمالي المتبقي'],
      moneyColumns: [3],
      totalColumns: [3],
      hasFilter: false,
      rows: report.unpaid.map((apartment) =>
        row(`unpaid:${apartment.apartmentNumber}`, [
          apartment.apartmentNumber,
          apartment.ownerName,
          apartment.monthsUnpaid.join('، '),
          apartment.remaining,
        ]),
      ),
    },
    {
      key: 'monthlySummary',
      name: REPORT_TABLE_NAMES.monthlySummary,
      headers: [
        'الشهر',
        'التحصيل',
        'التحصيلات الخاصة',
        'تعديلات الرصيد',
        'المصروفات',
        'الرصيد',
      ],
      moneyColumns: [1, 2, 3, 4, 5],
      totalColumns: [1, 2, 3, 4, 5],
      hasFilter: false,
      rows: report.monthlySummary.map((month) =>
        row(`month:${month.month}`, [
          month.month,
          month.collected,
          month.specialCollected,
          month.adjustments,
          month.expenses,
          month.balance,
        ]),
      ),
    },
  ];
}

export function hashRow(values: ReportCell[]): string {
  const text = JSON.stringify(values);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function tableRowHashes(table: ReportTable): Map<string, string> {
  return new Map(table.rows.map((tableRow) => [tableRow.key, hashRow(tableRow.values)]));
}

export function tablesRevision(tables: ReportTable[]): string {
  const payload = tables
    .map((table) => {
      const rows = [...table.rows]
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        .map((tableRow) => `${tableRow.key}=${hashRow(tableRow.values)}`)
        .join('|');
      return `${table.key}:${rows}`;
    })
    .join('||');
  return hashRow([payload]);
}
