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

function table(headers: string[], rows: PdfCell[][], totals?: PdfCell[], className?: string): string {
  const body = rows.length
    ? rows.map((row) => `<tr>${row.map((cell) => `<td>${renderCell(cell)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}">لا توجد بيانات في هذه الفترة.</td></tr>`;
  const totalRow = totals
    ? `<tr class="total">${totals.map((cell) => `<td>${renderCell(cell)}</td>`).join('')}</tr>`
    : '';
  const classAttribute = className ? ` class="${className}"` : '';
  return `<table${classAttribute}><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${body}${totalRow}</tbody></table>`;
}

export function buildReportPdfHtml(report: ReportData): string {
  const statusColor = (status: string) =>
    status === 'دفع' || status === 'مدفوع' ? '#16A34A' : status === 'جزئي' ? '#D97706' : '#DC2626';
  const statusLabel = (status: string) => (status === 'دفع' ? 'مدفوع' : status);
  const summary = [
    ['إجمالي التحصيل', money(report.summary.collected)],
    ['تحصيلات خاصة', money(report.summary.specialCollected)],
    ['تعديلات الرصيد', money(report.summary.adjustments)],
    ['إجمالي المصروفات', money(report.summary.totalExpenses)],
    ['الرصيد', money(report.summary.balance)],
    ['الشقق التي دفعت', `${report.summary.paidApartments} من ${report.summary.totalApartments}`],
    ['عدد الدفعات', String(report.payments.length)],
    ['عدد المصروفات', String(report.expenses.length)],
    ['عدد التحصيلات الخاصة', String(report.specialCollections.length)],
    ['الشقق المتأخرة', String(report.unpaid.length)],
  ];
  const badge = (status: string) => ({
    text: statusLabel(status),
    color: statusColor(status),
  });
  const apartmentRows = report.apartments.map((row) => [
    row.apartmentNumber, row.ownerName, money(row.due), money(row.paid), money(row.remaining),
    badge(row.status), row.monthsPaid.join('، ') || '—',
  ]);
  const payments = report.payments.map((row) => [
    row.date, row.apartmentNumber, row.ownerName, row.type, row.monthOrCollection, money(row.amount), row.note || '—',
  ]);
  const specialRows = report.specialCollections.map((collection) => [
    collection.title, collection.date, money(collection.amountPerApartment), String(collection.apartments.length),
    money(collection.due), money(collection.paid), money(collection.remaining),
  ]);
  const specialTotals: PdfCell[] = [
    'الإجمالي', '', '', '',
    money(report.specialCollections.reduce((sum, row) => sum + row.due, 0)),
    money(report.specialCollections.reduce((sum, row) => sum + row.paid, 0)),
    money(report.specialCollections.reduce((sum, row) => sum + row.remaining, 0)),
  ];
  const specialDetailRows = report.specialCollections.flatMap((collection) =>
    collection.apartments.map((row) => [
      collection.title, collection.date, money(collection.amountPerApartment), row.apartmentNumber,
      row.ownerName, money(row.due), money(row.paid), money(row.remaining),
      badge(row.status),
    ]));
  const specialDetailTotals: PdfCell[] = [
    'الإجمالي', '', '', '', '',
    money(report.specialCollections.reduce((sum, row) => sum + row.apartments.reduce((inner, apartment) => inner + apartment.due, 0), 0)),
    money(report.specialCollections.reduce((sum, row) => sum + row.apartments.reduce((inner, apartment) => inner + apartment.paid, 0), 0)),
    money(report.specialCollections.reduce((sum, row) => sum + row.apartments.reduce((inner, apartment) => inner + apartment.remaining, 0), 0)),
    '',
  ];
  const expenseRows = report.expenses.map((row) => [row.date, row.category, money(row.amount), row.note || '—', row.linkedCollection || '—']);
  const categoryRows = report.expensesByCategory.map((row) => [row.category, money(row.total)]);
  const categoryTotal = report.expensesByCategory.reduce((sum, row) => sum + row.total, 0);
  const adjustmentRows = report.adjustments.map((row) => [row.date, row.type, money(row.amount), row.reason, row.status, row.cancelReason || '—']);
  const adjustmentTotal = report.adjustments.reduce((sum, row) => sum + row.amount, 0);
  const unpaidRows = report.unpaid.map((row) => [row.apartmentNumber, row.ownerName, row.monthsUnpaid.join('، ') || '—', money(row.remaining)]);
  const unpaidTotal = report.unpaid.reduce((sum, row) => sum + row.remaining, 0);
  const apartmentTotals = [
    'الإجمالي', '',
    money(report.apartments.reduce((sum, row) => sum + row.due, 0)),
    money(report.apartments.reduce((sum, row) => sum + row.paid, 0)),
    money(report.apartments.reduce((sum, row) => sum + row.remaining, 0)),
    '', '',
  ];
  const paymentTotal = report.payments.reduce((sum, row) => sum + row.amount, 0);
  const expenseTotal = report.expenses.reduce((sum, row) => sum + row.amount, 0);
  const monthCells = report.monthlyMatrix.flatMap((year) =>
    year.apartments.map((apartment) => ({
      year: year.year,
      apartment,
      months: Array.from({ length: 12 }, (_, index) =>
        apartment.months[String(index + 1).padStart(2, '0')] ?? null),
    })),
  );
  const monthHeaders = [
    'السنة',
    'الشقة',
    'المالك',
    ...Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')),
    'إجمالي المدفوع',
    'إجمالي المتبقي',
  ];
  const monthRows = monthCells.map(({ year, apartment, months }) => [
    String(year),
    apartment.number,
    apartment.ownerName,
    ...months.map((entry) => (entry ? { text: String(entry.paid), color: statusColor(entry.status) } : '')),
    money(apartment.totalPaid),
    money(apartment.totalRemaining),
  ]);
  const monthTotals: PdfCell[] = [
    'الإجمالي',
    '',
    '',
    ...Array.from({ length: 12 }, (_, index) =>
      money(monthCells.reduce((sum, cell) => sum + Number(cell.months[index]?.paid ?? 0), 0))),
    money(monthCells.reduce((sum, cell) => sum + cell.apartment.totalPaid, 0)),
    money(monthCells.reduce((sum, cell) => sum + cell.apartment.totalRemaining, 0)),
  ];
  const monthlySummaryRows = report.monthlySummary.map((month) => [
    month.month,
    money(month.collected),
    money(month.specialCollected),
    money(month.adjustments),
    money(month.expenses),
    money(month.balance),
  ]);
  const monthlySummaryTotals: PdfCell[] = [
    'الإجمالي',
    money(report.monthlySummary.reduce((sum, month) => sum + month.collected, 0)),
    money(report.monthlySummary.reduce((sum, month) => sum + month.specialCollected, 0)),
    money(report.monthlySummary.reduce((sum, month) => sum + month.adjustments, 0)),
    money(report.monthlySummary.reduce((sum, month) => sum + month.expenses, 0)),
    money(report.monthlySummary.reduce((sum, month) => sum + month.balance, 0)),
  ];
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm; }
    body { direction: rtl; font-family: system-ui, sans-serif; color: #0F172A; font-size: 11pt; }
    h1 { font-size: 20pt; margin: 0 0 5mm; } h2 { font-size: 14pt; margin: 8mm 0 3mm; page-break-after: avoid; }
    .meta { color: #64748B; margin-bottom: 5mm; } table { width: 100%; border-collapse: collapse; margin: 0 0 5mm; }
    thead { display: table-header-group; } tr { page-break-inside: avoid; } th, td { border: 1px solid #D9E2EC; padding: 5px; text-align: right; vertical-align: top; }
    th { background: #DCFCE7; font-weight: bold; } tbody tr:nth-child(even) { background: #F4F7FA; }
    .total { font-weight: bold; }
    .compact { font-size: 7.5pt; table-layout: fixed; } .compact th, .compact td { padding: 2px; word-break: break-word; }
  </style></head><body>
    <h1>${escapeHtml(report.buildingName || 'تقرير العمارة')}</h1>
    <div class="meta">الفترة: ${escapeHtml(report.periodLabel)} — تاريخ إنشاء التقرير: ${escapeHtml(report.generatedAt.slice(0, 10))}</div>
    <h2>الملخص</h2>${table(['البيان', 'القيمة'], summary)}
    <h2>حالة الشقق للفترة</h2>${table(['الشقة', 'المالك', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة', 'الشهور المدفوعة'], apartmentRows, apartmentTotals)}
    <h2>كل الدفعات</h2>${table(['التاريخ', 'الشقة', 'المالك', 'النوع', 'الشهر أو التحصيل', 'المبلغ', 'ملاحظة'], payments, ['الإجمالي', '', '', '', '', money(paymentTotal), ''])}
    <h2>التحصيلات الخاصة</h2>${table(['التحصيل', 'التاريخ', 'لكل شقة', 'عدد الشقق', 'المطلوب', 'المدفوع', 'المتبقي'], specialRows, specialTotals)}
    <h2>تفاصيل التحصيلات الخاصة</h2>${table(['التحصيل', 'التاريخ', 'لكل شقة', 'الشقة', 'المالك', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة'], specialDetailRows, specialDetailTotals)}
    <h2>كل المصروفات</h2>${table(['التاريخ', 'النوع', 'المبلغ', 'ملاحظة', 'التحصيل المرتبط'], expenseRows, ['الإجمالي', '', money(expenseTotal), '', ''])}
    <h2>إجمالي المصروفات حسب النوع</h2>${table(['النوع', 'الإجمالي'], categoryRows, ['الإجمالي', money(categoryTotal)])}
    <h2>تعديلات الرصيد</h2>${table(['التاريخ', 'النوع', 'المبلغ', 'السبب', 'الحالة', 'سبب الإلغاء'], adjustmentRows, ['الإجمالي', '', money(adjustmentTotal), '', '', ''])}
    <h2>الشقق التي لم تسدد</h2>${table(['الشقة', 'المالك', 'الشهور غير المدفوعة', 'إجمالي المتبقي'], unpaidRows, ['الإجمالي', '', '', money(unpaidTotal)])}
    <h2>جدول الأشهر</h2>${table(monthHeaders, monthRows, monthTotals, 'compact')}
    <h2>ملخص كل شهر</h2>${table(
      ['الشهر', 'التحصيل', 'التحصيلات الخاصة', 'تعديلات الرصيد', 'المصروفات', 'الرصيد'],
      monthlySummaryRows,
      monthlySummaryTotals,
    )}
  </body></html>`;
}
