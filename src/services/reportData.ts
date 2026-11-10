import { getDatabase } from '@/db/schema';

export type ReportPeriod =
  | { kind: 'month'; value: string }
  | { kind: 'year'; value: string }
  | { kind: 'all' };

export type ReportStatus = 'دفع' | 'جزئي' | 'لم يدفع';

export interface ApartmentReportRow {
  apartmentNumber: string;
  ownerName: string;
  due: number;
  paid: number;
  remaining: number;
  status: ReportStatus;
  monthsPaid: string[];
}

export interface ReportPayment {
  date: string;
  apartmentNumber: string;
  ownerName: string;
  type: 'اشتراك شهري' | 'تحصيل خاص';
  monthOrCollection: string;
  amount: number;
  note: string;
}

export interface ReportExpense {
  date: string;
  category: string;
  amount: number;
  note: string;
  linkedCollection: string;
}

export interface ReportAdjustment {
  date: string;
  type: 'زيادة' | 'نقص';
  amount: number;
  reason: string;
  status: 'سارية' | 'ملغية';
  cancelReason: string;
}

export interface SpecialCollectionReport {
  id: number;
  title: string;
  date: string;
  amountPerApartment: number;
  due: number;
  paid: number;
  remaining: number;
  apartments: ApartmentReportRow[];
}

export interface ReportData {
  buildingName: string;
  periodLabel: string;
  generatedAt: string;
  summary: {
    collected: number;
    specialCollected: number;
    adjustments: number;
    totalExpenses: number;
    balance: number;
    paidApartments: number;
    totalApartments: number;
  };
  activeApartments: { number: string; ownerName: string }[];
  apartments: ApartmentReportRow[];
  payments: ReportPayment[];
  specialCollections: SpecialCollectionReport[];
  expenses: ReportExpense[];
  expensesByCategory: { category: string; total: number }[];
  adjustments: ReportAdjustment[];
  unpaid: { apartmentNumber: string; ownerName: string; monthsUnpaid: string[]; remaining: number }[];
  monthlySummary: { month: string; collected: number; expenses: number }[];
  monthlyMatrix: {
    year: number;
    apartments: {
      number: string;
      ownerName: string;
      months: Record<string, { paid: number; due: number; status: ReportStatus }>;
      totalPaid: number;
      totalRemaining: number;
    }[];
  }[];
}

interface ChargeRow {
  apartmentNumber: string;
  ownerName: string;
  type: 'monthly' | 'special' | null;
  month: string | null;
  specialId: number | null;
  specialTitle: string | null;
  amountDue: number | null;
  paid: number;
}

interface PaymentRow {
  date: string;
  apartmentNumber: string;
  ownerName: string;
  type: 'monthly' | 'special';
  month: string | null;
  specialTitle: string | null;
  amount: number;
  note: string;
}

function getRange(period: ReportPeriod): { start: string | null; end: string | null; label: string } {
  if (period.kind === 'all') return { start: null, end: null, label: 'كل الفترات' };
  if (period.kind === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(period.value)) {
    return { start: period.value, end: period.value, label: period.value };
  }
  if (period.kind === 'year' && /^\d{4}$/.test(period.value)) {
    return { start: `${period.value}-01`, end: `${period.value}-12`, label: period.value };
  }
  throw new Error('فترة التقرير غير صحيحة.');
}

function periodSql(column: string, start: string | null, end: string | null): { sql: string; params: string[] } {
  return start && end
    ? { sql: ` AND substr(${column}, 1, 7) >= ? AND substr(${column}, 1, 7) <= ?`, params: [start, end] }
    : { sql: '', params: [] };
}

function chargeStatus(due: number, paid: number): ReportStatus {
  if (due > 0 && paid >= due) return 'دفع';
  if (paid > 0) return 'جزئي';
  return 'لم يدفع';
}

export async function getReportData(period: ReportPeriod): Promise<ReportData> {
  const { start, end, label } = getRange(period);
  const db = await getDatabase();
  const paymentPeriod = periodSql('p.paid_date', start, end);
  const expensePeriod = periodSql('e.month', start, end);
  const adjustmentPeriod = periodSql('adj.adjustment_date', start, end);
  const specialPeriod = periodSql('s.date', start, end);

  const [building, activeApartments, chargeRows, paymentRows, expenses, adjustments, collectionRows, monthlyRows, monthTotals] = await Promise.all([
    db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'building_name'"),
    db.getAllAsync<{ number: string; ownerName: string }>(
      'SELECT number, owner_name AS ownerName FROM apartments WHERE active = 1 ORDER BY number',
    ),
    db.getAllAsync<ChargeRow>(
      `SELECT a.number AS apartmentNumber, a.owner_name AS ownerName,
        c.type, c.month, c.special_id AS specialId, s.title AS specialTitle,
        c.amount_due AS amountDue, COALESCE(pt.paid, 0) AS paid
       FROM apartments a
       LEFT JOIN charges c ON c.apartment_id = a.id AND (
         c.type = 'monthly'${start && end ? ' AND c.month >= ? AND c.month <= ?' : ''}
         OR (c.type = 'special' AND EXISTS (
           SELECT 1 FROM special_collections ps WHERE ps.id = c.special_id${specialPeriod.sql}
         ))
       )
       LEFT JOIN special_collections s ON s.id = c.special_id
       LEFT JOIN (
         SELECT charge_id, SUM(amount) AS paid FROM payments WHERE deleted = 0 GROUP BY charge_id
       ) pt ON pt.charge_id = c.id
       WHERE a.active = 1 OR c.id IS NOT NULL
       ORDER BY a.number, c.month, c.id`,
      [...(start && end ? [start, end] : []), ...specialPeriod.params],
    ),
    db.getAllAsync<PaymentRow>(
      `SELECT p.paid_date AS date, a.number AS apartmentNumber, a.owner_name AS ownerName,
        c.type, c.month, s.title AS specialTitle, p.amount, p.note
       FROM payments p JOIN charges c ON c.id = p.charge_id
       JOIN apartments a ON a.id = c.apartment_id
       LEFT JOIN special_collections s ON s.id = c.special_id
       WHERE p.deleted = 0${paymentPeriod.sql}
       ORDER BY p.paid_date, p.id`,
      paymentPeriod.params,
    ),
    db.getAllAsync<ReportExpense>(
      `SELECT e.expense_date AS date, cat.name AS category, e.amount, e.note,
        COALESCE(s.title, '') AS linkedCollection
       FROM expenses e JOIN expense_categories cat ON cat.id = e.category_id
       LEFT JOIN special_collections s ON s.id = e.special_id
       WHERE e.deleted = 0${expensePeriod.sql}
       ORDER BY e.expense_date, e.id`,
      expensePeriod.params,
    ),
    db.getAllAsync<{
      date: string; type: 'increase' | 'decrease'; amount: number;
      reason: string; status: 'active' | 'cancelled'; cancelReason: string | null;
    }>(
      `SELECT adj.adjustment_date AS date, adj.type, adj.amount, adj.reason,
        adj.status, adj.cancel_reason AS cancelReason
       FROM adjustments adj${start && end ? ` WHERE substr(adj.adjustment_date, 1, 7) >= ? AND substr(adj.adjustment_date, 1, 7) <= ?` : ''}
       ORDER BY adj.adjustment_date, adj.id`,
      adjustmentPeriod.params,
    ),
    db.getAllAsync<{
      id: number; title: string; date: string; amountPerApartment: number;
      apartmentNumber: string | null; ownerName: string | null; due: number | null; paid: number | null;
    }>(
      `SELECT s.id, s.title, s.date, s.amount_per_apartment AS amountPerApartment,
        a.number AS apartmentNumber, a.owner_name AS ownerName, c.amount_due AS due,
        COALESCE(pt.paid, 0) AS paid
       FROM special_collections s
       LEFT JOIN charges c ON c.special_id = s.id AND c.type = 'special'
       LEFT JOIN apartments a ON a.id = c.apartment_id
       LEFT JOIN (
         SELECT charge_id, SUM(amount) AS paid FROM payments WHERE deleted = 0 GROUP BY charge_id
       ) pt ON pt.charge_id = c.id
       WHERE 1 = 1${specialPeriod.sql}
       ORDER BY s.date, s.id, a.number`,
      specialPeriod.params,
    ),
    db.getAllAsync<ChargeRow>(
      `SELECT a.number AS apartmentNumber, a.owner_name AS ownerName, c.type, c.month,
        c.special_id AS specialId, s.title AS specialTitle, c.amount_due AS amountDue,
        COALESCE(pt.paid, 0) AS paid
       FROM charges c JOIN apartments a ON a.id = c.apartment_id
       LEFT JOIN special_collections s ON s.id = c.special_id
       LEFT JOIN (
         SELECT charge_id, SUM(amount) AS paid FROM payments WHERE deleted = 0 GROUP BY charge_id
       ) pt ON pt.charge_id = c.id
       WHERE c.type = 'monthly'
       ORDER BY c.month, a.number`,
    ),
    db.getAllAsync<{ month: string; collected: number; expenses: number }>(
      `SELECT month, SUM(collected) AS collected, SUM(expenses) AS expenses FROM (
         SELECT substr(paid_date, 1, 7) AS month, SUM(amount) AS collected, 0 AS expenses
         FROM payments WHERE deleted = 0 GROUP BY substr(paid_date, 1, 7)
         UNION ALL
         SELECT month, 0 AS collected, SUM(amount) AS expenses
         FROM expenses WHERE deleted = 0 GROUP BY month
       ) GROUP BY month ORDER BY month`,
    ),
  ]);
  const payments: ReportPayment[] = paymentRows.map((payment) => ({
    date: payment.date,
    apartmentNumber: payment.apartmentNumber,
    ownerName: payment.ownerName,
    type: payment.type === 'monthly' ? 'اشتراك شهري' : 'تحصيل خاص',
    monthOrCollection: payment.month ?? payment.specialTitle ?? '',
    amount: payment.amount,
    note: payment.note,
  }));
  const apartmentMap = new Map<string, ApartmentReportRow>();
  const unpaidMonths = new Map<string, Set<string>>();
  for (const charge of chargeRows) {
    const key = charge.apartmentNumber;
    let apartment = apartmentMap.get(key) ?? {
      apartmentNumber: key,
      ownerName: charge.ownerName,
      due: 0,
      paid: 0,
      remaining: 0,
      status: 'لم يدفع' as ReportStatus,
      monthsPaid: [],
    };
    if (!charge.type || charge.amountDue === null) {
      apartmentMap.set(key, apartment);
      continue;
    }
    const due = Number(charge.amountDue) || 0;
    const paid = Number(charge.paid) || 0;
    apartment.due += due;
    apartment.paid += paid;
    apartment.remaining += Math.max(0, due - paid);
    if (charge.type === 'monthly' && charge.month && due > 0 && paid >= due) {
      apartment.monthsPaid.push(charge.month);
    }
    if (charge.type === 'monthly' && charge.month && paid < due) {
      const months = unpaidMonths.get(key) ?? new Set<string>();
      months.add(charge.month);
      unpaidMonths.set(key, months);
    }
    apartmentMap.set(key, apartment);
  }
  const apartments = [...apartmentMap.values()]
    .map((row) => ({ ...row, monthsPaid: [...new Set(row.monthsPaid)].sort(), status: chargeStatus(row.due, row.paid) }))
    .filter((row) => row.due > 0)
    .sort((a, b) => a.apartmentNumber.localeCompare(b.apartmentNumber, undefined, { numeric: true }));
  const collected = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const specialCollected = payments
    .filter((payment) => payment.type === 'تحصيل خاص')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const netAdjustments = adjustments
    .filter((row) => row.status === 'active')
    .reduce((sum, row) => sum + (row.type === 'increase' ? row.amount : -row.amount), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const collections = new Map<number, SpecialCollectionReport>();
  for (const row of collectionRows) {
    let collection = collections.get(row.id);
    if (!collection) {
      collection = {
        id: row.id,
        title: row.title, date: row.date, amountPerApartment: row.amountPerApartment,
        due: 0, paid: 0, remaining: 0, apartments: [],
      };
      collections.set(row.id, collection);
    }
    if (row.apartmentNumber !== null && row.ownerName !== null) {
      const due = Number(row.due) || 0;
      const paid = Number(row.paid) || 0;
      collection.apartments.push({
        apartmentNumber: row.apartmentNumber,
        ownerName: row.ownerName,
        due,
        paid,
        remaining: Math.max(0, due - paid),
        status: chargeStatus(due, paid),
        monthsPaid: [],
      });
      collection.due += due;
      collection.paid += paid;
      collection.remaining += Math.max(0, due - paid);
    }
  }

  const categoryTotals = new Map<string, number>();
  for (const expense of expenses) categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + expense.amount);
  const unpaid = apartments
    .filter((row) => row.remaining > 0)
    .map((row) => ({
      apartmentNumber: row.apartmentNumber,
      ownerName: row.ownerName,
      monthsUnpaid: [...(unpaidMonths.get(row.apartmentNumber) ?? [])].sort(),
      remaining: row.remaining,
    }));

  const matrixYears = new Map<number, Map<string, ReportData['monthlyMatrix'][number]['apartments'][number]>>();
  for (const row of monthlyRows) {
    if (!row.month) continue;
    const year = Number(row.month.slice(0, 4));
    const monthKey = row.month.slice(5, 7);
    const yearApartments = matrixYears.get(year) ?? new Map();
    const apartment = yearApartments.get(row.apartmentNumber) ?? {
      number: row.apartmentNumber, ownerName: row.ownerName, months: {}, totalPaid: 0, totalRemaining: 0,
    };
    const paid = Number(row.paid) || 0;
    const due = Number(row.amountDue) || 0;
    apartment.months[monthKey] = { paid, due, status: chargeStatus(due, paid) };
    apartment.totalPaid += paid;
    apartment.totalRemaining += Math.max(0, due - paid);
    yearApartments.set(row.apartmentNumber, apartment);
    matrixYears.set(year, yearApartments);
  }

  return {
    buildingName: building?.value ?? '',
    periodLabel: label,
    generatedAt: new Date().toISOString(),
    activeApartments,
    summary: {
      collected,
      specialCollected,
      adjustments: netAdjustments,
      totalExpenses,
      balance: collected + netAdjustments - totalExpenses,
      paidApartments: apartments.filter((row) => row.due > 0 && row.remaining === 0).length,
      totalApartments: activeApartments.length,
    },
    apartments,
    payments,
    specialCollections: [...collections.values()],
    expenses,
    expensesByCategory: [...categoryTotals].map(([category, total]) => ({ category, total })),
    adjustments: adjustments.map((row) => ({
      date: row.date,
      type: row.type === 'increase' ? 'زيادة' : 'نقص',
      amount: row.amount,
      reason: row.reason,
      status: row.status === 'active' ? 'سارية' : 'ملغية',
      cancelReason: row.cancelReason ?? '',
    })),
    unpaid,
    monthlySummary: monthTotals
      .filter((row) => !start || (row.month >= start && row.month <= (end ?? start)))
      .map((row) => ({ month: row.month, collected: row.collected, expenses: row.expenses })),
    monthlyMatrix: [...matrixYears.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, rows]) => ({
        year,
        apartments: [...rows.values()]
          .filter((row) => !start || Object.keys(row.months).some((month) => `${year}-${month}` >= start && `${year}-${month}` <= (end ?? start)))
          .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
      }))
      .filter((row) => row.apartments.length > 0),
  };
}
