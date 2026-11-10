import { getDatabase } from '@/db/schema';

export type ExportPeriod =
  | { kind: 'month'; value: string }
  | { kind: 'year'; value: string }
  | { kind: 'all' };

export interface ExportData {
  periodLabel: string;
  summary: { label: string; value: string | number }[];
  monthlyMatrix: Record<string, string | number | null>[];
  expenses: Record<string, string | number | null>[];
  adjustments: Record<string, string | number | null>[];
  specialCollections: Record<string, string | number | null>[];
  unpaid: Record<string, string | number | null>[];
}

function range(period: ExportPeriod): { start: string | null; end: string | null; label: string } {
  if (period.kind === 'all') return { start: null, end: null, label: 'كل الفترات' };
  if (period.kind === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(period.value)) {
    return {
      start: period.value,
      end: period.value,
      label: period.value,
    };
  }
  if (period.kind === 'year' && /^\d{4}$/.test(period.value)) {
    return {
      start: `${period.value}-01`,
      end: `${period.value}-12`,
      label: period.value,
    };
  }
  throw new Error('فترة التصدير غير صحيحة.');
}

function dateConditions(column: string, start: string | null, end: string | null): string {
  if (!start || !end) return '';
  return ` AND substr(${column}, 1, 7) >= ? AND substr(${column}, 1, 7) <= ?`;
}

function dateParams(start: string | null, end: string | null): string[] {
  return start && end ? [start, end] : [];
}

export async function buildExportData(period: ExportPeriod): Promise<ExportData> {
  const { start, end, label } = range(period);
  const db = await getDatabase();

  const [collected, adjustmentTotal, expensesTotal, chargeRows, expenses, adjustments, specialCollections, unpaid] = await Promise.all([
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(p.amount), 0) AS total
       FROM payments p
       WHERE p.deleted = 0${dateConditions('p.paid_date', start, end)}`,
      dateParams(start, end),
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(CASE WHEN type = 'increase' THEN amount ELSE -amount END), 0) AS total
       FROM adjustments WHERE status = 'active'${dateConditions('adjustment_date', start, end)}`,
      dateParams(start, end),
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(e.amount), 0) AS total FROM expenses e
       WHERE e.deleted = 0${dateConditions('e.month', start, end)}`,
      dateParams(start, end),
    ),
    db.getAllAsync<{
      apartmentNumber: string;
      ownerName: string;
      month: string;
      due: number;
      paid: number;
    }>(
      `SELECT a.number AS apartmentNumber, a.owner_name AS ownerName,
        c.month AS month, c.amount_due AS due,
        COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid
       FROM charges c
       JOIN apartments a ON a.id = c.apartment_id
       LEFT JOIN payments p ON p.charge_id = c.id
       WHERE c.type = 'monthly'${dateConditions('c.month', start, end)}
       GROUP BY c.id, a.id
       ORDER BY c.month, a.number`,
      dateParams(start, end),
    ),
    db.getAllAsync<Record<string, string | number | null>>(
      `SELECT e.expense_date AS 'التاريخ', cat.name AS 'النوع',
        e.amount AS 'المبلغ', e.note AS 'ملاحظة', s.title AS 'التحصيل الخاص'
       FROM expenses e
       JOIN expense_categories cat ON cat.id = e.category_id
       LEFT JOIN special_collections s ON s.id = e.special_id
       WHERE e.deleted = 0${dateConditions('e.month', start, end)}
       ORDER BY e.expense_date, e.id`,
      dateParams(start, end),
    ),
    db.getAllAsync<{
      adjustment_date: string;
      type: 'increase' | 'decrease';
      amount: number;
      reason: string;
      status: 'active' | 'cancelled';
      cancel_reason: string | null;
    }>(
      `SELECT adjustment_date, type, amount, reason, status, cancel_reason
       FROM adjustments${start && end ? ' WHERE substr(adjustment_date, 1, 7) >= ? AND substr(adjustment_date, 1, 7) <= ?' : ''}
       ORDER BY adjustment_date DESC, id DESC`,
      dateParams(start, end),
    ),
    db.getAllAsync<Record<string, string | number | null>>(
      `SELECT s.title AS 'اسم التحصيل', s.date AS 'التاريخ',
        s.amount_per_apartment AS 'المبلغ لكل شقة',
        COALESCE((SELECT SUM(c.amount_due) FROM charges c WHERE c.special_id = s.id), 0) AS 'المطلوب',
        COALESCE((SELECT SUM(p.amount) FROM payments p JOIN charges c ON c.id = p.charge_id
          WHERE c.special_id = s.id AND p.deleted = 0), 0) AS 'المحصل',
        COALESCE((SELECT SUM(e.amount) FROM expenses e
          WHERE e.special_id = s.id AND e.deleted = 0), 0) AS 'المصروف'
       FROM special_collections s
       WHERE 1 = 1${dateConditions('s.date', start, end)}
       ORDER BY s.date, s.id`,
      dateParams(start, end),
    ),
    db.getAllAsync<Record<string, string | number | null>>(
      `SELECT a.number AS 'رقم الشقة', a.owner_name AS 'اسم المالك',
        CASE WHEN c.type = 'monthly' THEN c.month ELSE s.title END AS 'الشهر أو التحصيل',
        c.amount_due AS 'المطلوب',
        COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS 'المدفوع',
        MAX(0, c.amount_due - COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0)) AS 'المتبقي'
       FROM charges c
       JOIN apartments a ON a.id = c.apartment_id
       LEFT JOIN special_collections s ON s.id = c.special_id
       LEFT JOIN payments p ON p.charge_id = c.id
       WHERE 1 = 1 AND (
         (c.type = 'monthly'${dateConditions('c.month', start, end)})
         OR (c.type = 'special'${dateConditions('s.date', start, end)})
       )
       GROUP BY c.id, a.id
       HAVING c.amount_due > COALESCE(
         SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0
       )
       ORDER BY a.number`,
      [...dateParams(start, end), ...dateParams(start, end)],
    ),
  ]);
  const netAdjustments = adjustmentTotal?.total ?? 0;
  const totalCollected = (collected?.total ?? 0) + netAdjustments;
  const totalExpenses = expensesTotal?.total ?? 0;
  const months = [...new Set(chargeRows.map((row) => row.month))].sort();
  const monthlyMatrix = new Map<
    string,
    Record<string, string | number | null>
  >();
  for (const row of chargeRows) {
    let apartment = monthlyMatrix.get(row.apartmentNumber);
    if (!apartment) {
      apartment = {
        'رقم الشقة': row.apartmentNumber,
        'اسم المالك': row.ownerName,
      };
      monthlyMatrix.set(row.apartmentNumber, apartment);
    }
    const status = row.paid >= row.due ? 'مدفوع' : row.paid > 0 ? 'جزئي' : 'لم يدفع';
    apartment[row.month] = `${status} (${row.paid} / ${row.due} ج)`;
  }
  return {
    periodLabel: label,
    summary: [
      { label: 'الفترة', value: label },
      { label: 'إجمالي التحصيل', value: totalCollected },
      { label: 'صافي التسويات', value: netAdjustments },
      { label: 'إجمالي المصروفات', value: totalExpenses },
      { label: 'الرصيد', value: totalCollected - totalExpenses },
    ],
    monthlyMatrix: [...monthlyMatrix.values()].map((row) => {
      const completeRow = { ...row };
      for (const month of months) completeRow[month] ??= null;
      return completeRow;
    }),
    expenses,
    adjustments: adjustments.map((adjustment) => ({
      'التاريخ': adjustment.adjustment_date,
      'النوع': adjustment.type === 'increase' ? 'زيادة' : 'نقص',
      'المبلغ': adjustment.amount,
      'السبب': adjustment.reason,
      'الحالة': adjustment.status === 'active' ? 'سارية' : 'ملغية',
      'سبب الإلغاء': adjustment.cancel_reason ?? '',
    })),
    specialCollections,
    unpaid,
  };
}
