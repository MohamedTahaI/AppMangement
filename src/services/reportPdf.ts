import type { ReportData } from './reportData';

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value: number): string {
  return `\u200E${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج\u200E`;
}

type PdfCell = string | number | { text: string; color: string };

function renderCell(value: PdfCell): string {
  if (typeof value === 'object') {
    return `<span style="color:${value.color};font-weight:bold">${escapeHtml(value.text)}</span>`;
  }
  return escapeHtml(value);
}

function table(headers: string[], rows: PdfCell[][], totals?: PdfCell[]): string {
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${renderCell(cell)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}">لا توجد بيانات في هذه الفترة.</td></tr>`;
  const totalRow = totals
    ? `<tr class="total">${totals.map((cell) => `<td>${renderCell(cell)}</td>`).join('')}</tr>`
    : '';
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${body}${totalRow}</tbody></table>`;
}

export function buildReportPdfHtml(report: ReportData): string {
  const statusColor = (status: string) => status === 'دفع' ? '#16A34A' : status === 'جزئي' ? '#D97706' : '#DC2626';
  const summary = [
    ['إجمالي التحصيل', money(report.summary.collected)],
    ['تحصيلات خاصة', money(report.summary.specialCollected)],
    ['تعديلات الرصيد', money(report.summary.adjustments)],
    ['إجمالي المصروفات', money(report.summary.totalExpenses)],
    ['الرصيد', money(report.summary.balance)],
    ['الشقق التي دفعت', `${report.summary.paidApartments} من ${report.summary.totalApartments}`],
  ];
  const badge = (status: string) => ({
    text: status,
    color: statusColor(status),
  });
  const apartmentRows = report.apartments.map((row) => [
    row.apartmentNumber, row.ownerName, money(row.due), money(row.paid), money(row.remaining),
    badge(row.status), row.monthsPaid.join('، ') || '—',
  ]);
  const payments = report.payments.map((row) => [
    row.date, row.apartmentNumber, row.ownerName, row.type, row.monthOrCollection, money(row.amount), row.note || '—',
  ]);
  const specialRows = report.specialCollections.flatMap((collection) => collection.apartments.map((row) => [
    collection.title, collection.date, money(collection.amountPerApartment), row.apartmentNumber,
    money(row.due), money(row.paid), money(row.remaining),
    badge(row.status),
  ]));
  const expenseRows = report.expenses.map((row) => [row.date, row.category, money(row.amount), row.note || '—', row.linkedCollection || '—']);
  const categoryRows = report.expensesByCategory.map((row) => [row.category, money(row.total)]);
  const adjustmentRows = report.adjustments.map((row) => [row.date, row.type, money(row.amount), row.reason, row.status, row.cancelReason || '—']);
  const unpaidRows = report.unpaid.map((row) => [row.apartmentNumber, row.ownerName, row.monthsUnpaid.join('، ') || '—', money(row.remaining)]);
  const apartmentTotals = [
    'الإجمالي', '',
    money(report.apartments.reduce((sum, row) => sum + row.due, 0)),
    money(report.apartments.reduce((sum, row) => sum + row.paid, 0)),
    money(report.apartments.reduce((sum, row) => sum + row.remaining, 0)),
    '', '',
  ];
  const paymentTotal = report.payments.reduce((sum, row) => sum + row.amount, 0);
  const expenseTotal = report.expenses.reduce((sum, row) => sum + row.amount, 0);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm; }
    body { direction: rtl; font-family: system-ui, sans-serif; color: #0F172A; font-size: 11pt; }
    h1 { font-size: 20pt; margin: 0 0 5mm; } h2 { font-size: 14pt; margin: 8mm 0 3mm; page-break-after: avoid; }
    .meta { color: #64748B; margin-bottom: 5mm; } table { width: 100%; border-collapse: collapse; margin: 0 0 5mm; }
    thead { display: table-header-group; } tr { page-break-inside: avoid; } th, td { border: 1px solid #D9E2EC; padding: 5px; text-align: right; vertical-align: top; }
    th { background: #DCFCE7; font-weight: bold; } tbody tr:nth-child(even) { background: #F4F7FA; }
    .total { font-weight: bold; }
  </style></head><body>
    <h1>${escapeHtml(report.buildingName || 'تقرير العمارة')}</h1>
    <div class="meta">الفترة: ${escapeHtml(report.periodLabel)} — تاريخ إنشاء التقرير: ${escapeHtml(report.generatedAt.slice(0, 10))}</div>
    <h2>الملخص</h2>${table(['البيان', 'القيمة'], summary)}
    <h2>حالة الشقق للفترة</h2>${table(['الشقة', 'المالك', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة', 'الشهور المدفوعة'], apartmentRows, apartmentTotals)}
    <h2>كل الدفعات</h2>${table(['التاريخ', 'الشقة', 'المالك', 'النوع', 'الشهر أو التحصيل', 'المبلغ', 'ملاحظة'], payments, ['الإجمالي', '', '', '', '', money(paymentTotal), ''])}
    <h2>التحصيلات الخاصة</h2>${table(['التحصيل', 'التاريخ', 'لكل شقة', 'الشقة', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة'], specialRows)}
    <h2>كل المصروفات</h2>${table(['التاريخ', 'النوع', 'المبلغ', 'ملاحظة', 'التحصيل المرتبط'], expenseRows, ['الإجمالي', '', money(expenseTotal), '', ''])}
    <h2>إجمالي المصروفات حسب النوع</h2>${table(['النوع', 'الإجمالي'], categoryRows)}
    <h2>تعديلات الرصيد</h2>${table(['التاريخ', 'النوع', 'المبلغ', 'السبب', 'الحالة', 'سبب الإلغاء'], adjustmentRows)}
    <h2>الشقق التي لم تسدد</h2>${table(['الشقة', 'المالك', 'الشهور غير المدفوعة', 'إجمالي المتبقي'], unpaidRows)}
  </body></html>`;
}
