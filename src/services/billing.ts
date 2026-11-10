import type { Apartment } from '../db/apartments';
import { getDatabase, markDirty } from '../db/schema';
import { getSetting } from '../db/settings';

export type ChargeStatus = 'paid' | 'partial' | 'unpaid';

export interface ChargeSummary {
  chargeId: number;
  apartmentId: number;
  type: 'monthly' | 'special';
  month: string | null;
  specialId: number | null;
  due: number;
  paid: number;
  remaining: number;
  status: ChargeStatus;
}

export interface PaymentAllocation {
  chargeId: number;
  month: string;
  amount: number;
}

export interface UnpaidCharge extends ChargeSummary {
  apartmentNumber: string;
  ownerName: string;
}

export interface DashboardTotals {
  totalCollected: number;
  totalAdjustments: number;
  monthCollected: number;
  monthAdjustments: number;
  monthExpenses: number;
  balance: number;
}

export interface MonthlyApartmentRow {
  apartment: Apartment;
  summary: ChargeSummary;
}

export interface ApartmentMonthPreview {
  month: string;
  chargeId: number | null;
  due: number;
  paid: number;
  remaining: number;
  status: ChargeStatus;
}

export interface MonthlyMatrixRow {
  apartment: Apartment;
  months: Record<string, ChargeSummary | null>;
}

function assertMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`Invalid month "${month}". Expected YYYY-MM.`);
  }
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, offset: number): string {
  const [yearText, monthText] = month.split('-');
  const date = new Date(Number(yearText), Number(monthText) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function statusFor(due: number, paid: number): ChargeStatus {
  if (paid >= due) return 'paid';
  return paid > 0 ? 'partial' : 'unpaid';
}

async function ensureChargeWithDb(
  db: Awaited<ReturnType<typeof getDatabase>>,
  apartmentId: number,
  month: string,
): Promise<{ chargeId: number; created: boolean }> {
  assertMonth(month);
  const fee = await db.getFirstAsync<{ amount: number }>(
    'SELECT amount FROM fee_rates WHERE effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
    month,
  );
  if (!fee) {
    throw new Error(`No monthly fee is configured for ${month}.`);
  }

  const result = await db.runAsync(
    `INSERT OR IGNORE INTO charges (apartment_id, type, month, amount_due)
     VALUES (?, 'monthly', ?, ?)`,
    apartmentId,
    month,
    fee.amount,
  );
  if (result.changes > 0) await markDirty(db);

  const charge = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM charges WHERE apartment_id = ? AND type = 'monthly' AND month = ?",
    apartmentId,
    month,
  );
  if (!charge) throw new Error(`Could not create or find charge for apartment ${apartmentId}.`);
  return { chargeId: charge.id, created: result.changes > 0 };
}

export async function getFeeForMonth(month: string): Promise<number> {
  assertMonth(month);
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ amount: number }>(
    'SELECT amount FROM fee_rates WHERE effective_from <= ? ORDER BY effective_from DESC LIMIT 1',
    month,
  );
  if (!row) throw new Error(`No monthly fee is configured for ${month}.`);
  return row.amount;
}

export async function ensureCharge(apartmentId: number, month: string): Promise<number> {
  const db = await getDatabase();
  const result = await ensureChargeWithDb(db, apartmentId, month);
  return result.chargeId;
}

export async function ensureMonthlyCharges(month = currentMonth()): Promise<number> {
  assertMonth(month);
  const db = await getDatabase();
  const startMonth = await getSetting('start_month');
  if (!startMonth) throw new Error('The start_month setting is missing.');
  assertMonth(startMonth);

  const thisMonth = currentMonth();
  if (startMonth > thisMonth && month <= thisMonth) return 0;

  const apartments = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM apartments WHERE active = 1 ORDER BY number',
  );
  let created = 0;
  for (let cursor = startMonth; cursor <= thisMonth; cursor = shiftMonth(cursor, 1)) {
    for (const apartment of apartments) {
      const result = await ensureChargeWithDb(db, apartment.id, cursor);
      if (result.created) created += 1;
    }
  }
  if (month > thisMonth) {
    for (const apartment of apartments) {
      const result = await ensureChargeWithDb(db, apartment.id, month);
      if (result.created) created += 1;
    }
  }
  return created;
}

export async function getChargeSummary(chargeId: number): Promise<ChargeSummary> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    id: number;
    apartment_id: number;
    type: 'monthly' | 'special';
    month: string | null;
    special_id: number | null;
    amount_due: number;
    amount_paid: number;
  }>(
    `SELECT c.id, c.apartment_id, c.type, c.month, c.special_id, c.amount_due,
      COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS amount_paid
     FROM charges c LEFT JOIN payments p ON p.charge_id = c.id
     WHERE c.id = ? GROUP BY c.id`,
    chargeId,
  );
  if (!row) throw new Error(`Charge ${chargeId} was not found.`);
  const paid = row.amount_paid;
  return {
    chargeId: row.id,
    apartmentId: row.apartment_id,
    type: row.type,
    month: row.month,
    specialId: row.special_id,
    due: row.amount_due,
    paid,
    remaining: Math.max(0, row.amount_due - paid),
    status: statusFor(row.amount_due, paid),
  };
}

export async function getMonthlyApartmentRows(month: string): Promise<MonthlyApartmentRow[]> {
  assertMonth(month);
  const db = await getDatabase();
  const startMonth = await getSetting('start_month');
  if (!startMonth) throw new Error('The start_month setting is missing.');
  if (month < startMonth) return [];
  await ensureMonthlyCharges(month);
  const rows = await db.getAllAsync<{
    id: number;
    number: string;
    owner_name: string;
    active: number;
    charge_id: number | null;
    amount_due: number | null;
    paid: number;
  }>(
    `SELECT a.id, a.number, a.owner_name, a.active, c.id AS charge_id, c.amount_due,
      COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid
     FROM apartments a
     LEFT JOIN charges c ON c.apartment_id = a.id AND c.type = 'monthly' AND c.month = ?
     LEFT JOIN payments p ON p.charge_id = c.id
     WHERE a.active = 1
     GROUP BY a.id, c.id
     ORDER BY a.number`,
    month,
  );
  return rows.map((row) => {
    if (row.charge_id === null || row.amount_due === null) {
      throw new Error(`Monthly charge for apartment ${row.number} was not created.`);
    }
    return {
      apartment: {
        id: row.id,
        number: row.number,
        owner_name: row.owner_name,
        active: row.active,
      },
      summary: {
        chargeId: row.charge_id,
        apartmentId: row.id,
        type: 'monthly',
        month,
        specialId: null,
        due: row.amount_due,
        paid: row.paid,
        remaining: Math.max(0, row.amount_due - row.paid),
        status: statusFor(row.amount_due, row.paid),
      },
    };
  });
}

export async function getApartmentYearPreviews(
  apartmentId: number,
  year: number,
): Promise<ApartmentMonthPreview[]> {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error('Year must be a four-digit calendar year.');
  }
  const db = await getDatabase();
  const startMonth = await getSetting('start_month');
  if (!startMonth) throw new Error('The start_month setting is missing.');
  const charges = await db.getAllAsync<{
    id: number;
    month: string;
    amount_due: number;
    paid: number;
  }>(
    `SELECT c.id, c.month, c.amount_due,
      COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid
     FROM charges c LEFT JOIN payments p ON p.charge_id = c.id
     WHERE c.apartment_id = ? AND c.type = 'monthly'
       AND c.month >= ? AND c.month <= ?
     GROUP BY c.id ORDER BY c.month`,
    apartmentId,
    `${year}-01`,
    `${year}-12`,
  );
  const chargesByMonth = new Map(charges.map((charge) => [charge.month, charge]));
  const previews: ApartmentMonthPreview[] = [];

  for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
    const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
    if (month < startMonth) continue;

    const existing = chargesByMonth.get(month);
    if (existing) {
      previews.push({
        month,
        chargeId: existing.id,
        due: existing.amount_due,
        paid: existing.paid,
        remaining: Math.max(0, existing.amount_due - existing.paid),
        status: statusFor(existing.amount_due, existing.paid),
      });
      continue;
    }

    try {
      const due = await getFeeForMonth(month);
      previews.push({
        month,
        chargeId: null,
        due,
        paid: 0,
        remaining: due,
        status: statusFor(due, 0),
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('No monthly fee is configured')) {
        throw error;
      }
    }
  }
  return previews;
}

export async function recordPayment(
  apartmentId: number,
  months: string[],
  amount: number,
  paidDate = new Date().toISOString().slice(0, 10),
  note = '',
): Promise<PaymentAllocation[]> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }
  const orderedMonths = [...new Set(months)].sort();
  if (orderedMonths.length === 0) throw new Error('Select at least one month.');
  orderedMonths.forEach(assertMonth);

  const db = await getDatabase();
  const chargeIds = new Map<string, number>();
  for (const month of orderedMonths) {
    const result = await ensureChargeWithDb(db, apartmentId, month);
    chargeIds.set(month, result.chargeId);
  }

  const allocations: PaymentAllocation[] = [];
  await db.withTransactionAsync(async () => {
    const balances: { month: string; chargeId: number; remaining: number }[] = [];
    for (const month of orderedMonths) {
      const chargeId = chargeIds.get(month);
      if (chargeId === undefined) throw new Error(`Charge for ${month} was not found.`);
      const row = await db.getFirstAsync<{ amount_due: number; paid: number }>(
        `SELECT c.amount_due,
          COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid
         FROM charges c LEFT JOIN payments p ON p.charge_id = c.id
         WHERE c.id = ? GROUP BY c.id`,
        chargeId,
      );
      if (!row) throw new Error(`Charge for ${month} was not found.`);
      balances.push({
        month,
        chargeId,
        remaining: Math.max(0, row.amount_due - row.paid),
      });
    }

    const totalRemaining = balances.reduce((sum, item) => sum + item.remaining, 0);
    if (amount > totalRemaining) {
      throw new Error(`Payment exceeds the remaining amount by ${amount - totalRemaining}.`);
    }

    let unallocated = amount;
    for (const balance of balances) {
      if (unallocated <= 0) break;
      const allocation = Math.min(balance.remaining, unallocated);
      if (allocation <= 0) continue;
      await db.runAsync(
        'INSERT INTO payments (charge_id, amount, paid_date, note) VALUES (?, ?, ?, ?)',
        balance.chargeId,
        allocation,
        paidDate,
        note,
      );
      allocations.push({
        chargeId: balance.chargeId,
        month: balance.month,
        amount: allocation,
      });
      unallocated -= allocation;
    }
    if (allocations.length > 0) await markDirty(db);
  });
  return allocations;
}

export async function recordSpecialPayment(
  apartmentId: number,
  specialId: number,
  amount: number,
  paidDate = new Date().toISOString().slice(0, 10),
  note = '',
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }
  const db = await getDatabase();
  let paymentId = 0;
  await db.withTransactionAsync(async () => {
    const charge = await db.getFirstAsync<{ id: number; amount_due: number; paid: number }>(
      `SELECT c.id, c.amount_due,
        COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid
       FROM charges c LEFT JOIN payments p ON p.charge_id = c.id
       WHERE c.apartment_id = ? AND c.type = 'special' AND c.special_id = ?
       GROUP BY c.id`,
      apartmentId,
      specialId,
    );
    if (!charge) throw new Error('Special collection charge was not found.');
    const remaining = Math.max(0, charge.amount_due - charge.paid);
    if (amount > remaining) {
      throw new Error(`Payment exceeds the remaining amount by ${amount - remaining}.`);
    }
    const payment = await db.runAsync(
      'INSERT INTO payments (charge_id, amount, paid_date, note) VALUES (?, ?, ?, ?)',
      charge.id,
      amount,
      paidDate,
      note,
    );
    paymentId = payment.lastInsertRowId;
    await markDirty(db);
  });
  return paymentId;
}

export async function createSpecialCollection(values: {
  title: string;
  amountPerApartment: number;
  date: string;
  note?: string;
}): Promise<number> {
  if (!values.title.trim()) throw new Error('Special collection title is required.');
  if (!Number.isFinite(values.amountPerApartment) || values.amountPerApartment < 0) {
    throw new Error('Special collection amount must be zero or more.');
  }

  const db = await getDatabase();
  let collectionId = 0;
  await db.withTransactionAsync(async () => {
    const collection = await db.runAsync(
      `INSERT INTO special_collections (title, amount_per_apartment, date, note)
       VALUES (?, ?, ?, ?)`,
      values.title.trim(),
      values.amountPerApartment,
      values.date,
      values.note ?? '',
    );
    collectionId = collection.lastInsertRowId;
    const apartments = await db.getAllAsync<{ id: number }>(
      'SELECT id FROM apartments WHERE active = 1',
    );
    for (const apartment of apartments) {
      await db.runAsync(
        `INSERT INTO charges (apartment_id, type, special_id, amount_due)
         VALUES (?, 'special', ?, ?)`,
        apartment.id,
        collectionId,
        values.amountPerApartment,
      );
    }
    await markDirty(db);
  });
  return collectionId;
}

export async function getDashboardTotals(month: string): Promise<DashboardTotals> {
  assertMonth(month);
  const db = await getDatabase();
  const totals = await db.getFirstAsync<{
    total_collected: number;
    total_adjustments: number;
    month_collected: number;
    month_adjustments: number;
    month_expenses: number;
    total_expenses: number;
  }>(
    `SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE deleted = 0)
        + (SELECT COALESCE(SUM(CASE WHEN type = 'increase' THEN amount ELSE -amount END), 0)
           FROM adjustments WHERE status = 'active') AS total_collected,
      (SELECT COALESCE(SUM(CASE WHEN type = 'increase' THEN amount ELSE -amount END), 0)
       FROM adjustments WHERE status = 'active') AS total_adjustments,
      (SELECT COALESCE(SUM(amount), 0) FROM payments
       WHERE deleted = 0 AND substr(paid_date, 1, 7) = ?)
        + (SELECT COALESCE(SUM(CASE WHEN type = 'increase' THEN amount ELSE -amount END), 0)
           FROM adjustments WHERE status = 'active' AND month = ?) AS month_collected,
      (SELECT COALESCE(SUM(CASE WHEN type = 'increase' THEN amount ELSE -amount END), 0)
       FROM adjustments WHERE status = 'active' AND month = ?) AS month_adjustments,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses
       WHERE deleted = 0 AND month = ?) AS month_expenses,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE deleted = 0) AS total_expenses`,
    month,
    month,
    month,
    month,
  );
  const totalCollected = totals?.total_collected ?? 0;
  const totalExpenses = totals?.total_expenses ?? 0;
  return {
    totalCollected,
    totalAdjustments: totals?.total_adjustments ?? 0,
    monthCollected: totals?.month_collected ?? 0,
    monthAdjustments: totals?.month_adjustments ?? 0,
    monthExpenses: totals?.month_expenses ?? 0,
    balance: totalCollected - totalExpenses,
  };
}

export async function getUnpaidForMonth(month: string): Promise<UnpaidCharge[]> {
  assertMonth(month);
  await ensureMonthlyCharges(month);
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    apartment_id: number;
    month: string;
    amount_due: number;
    paid: number;
    number: string;
    owner_name: string;
  }>(
    `SELECT c.id, c.apartment_id, c.month, c.amount_due,
      COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid,
      a.number, a.owner_name
     FROM charges c
     JOIN apartments a ON a.id = c.apartment_id
     LEFT JOIN payments p ON p.charge_id = c.id
     WHERE c.type = 'monthly' AND c.month = ?
     GROUP BY c.id, a.id
     HAVING paid < c.amount_due
     ORDER BY a.number`,
    month,
  );
  return rows.map((row) => ({
    chargeId: row.id,
    apartmentId: row.apartment_id,
    type: 'monthly',
    month: row.month,
    specialId: null,
    due: row.amount_due,
    paid: row.paid,
    remaining: Math.max(0, row.amount_due - row.paid),
    status: statusFor(row.amount_due, row.paid),
    apartmentNumber: row.number,
    ownerName: row.owner_name,
  }));
}

export async function getUnpaidForSpecial(specialId: number): Promise<UnpaidCharge[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    apartment_id: number;
    amount_due: number;
    paid: number;
    number: string;
    owner_name: string;
  }>(
    `SELECT c.id, c.apartment_id, c.amount_due,
      COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid,
      a.number, a.owner_name
     FROM charges c
     JOIN apartments a ON a.id = c.apartment_id
     LEFT JOIN payments p ON p.charge_id = c.id
     WHERE c.type = 'special' AND c.special_id = ?
     GROUP BY c.id, a.id
     HAVING paid < c.amount_due
     ORDER BY a.number`,
    specialId,
  );
  return rows.map((row) => ({
    chargeId: row.id,
    apartmentId: row.apartment_id,
    type: 'special',
    month: null,
    specialId,
    due: row.amount_due,
    paid: row.paid,
    remaining: Math.max(0, row.amount_due - row.paid),
    status: statusFor(row.amount_due, row.paid),
    apartmentNumber: row.number,
    ownerName: row.owner_name,
  }));
}

export async function getMonthlyMatrix(year: number): Promise<MonthlyMatrixRow[]> {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error('Year must be a four-digit calendar year.');
  }
  await ensureMonthlyCharges();
  const db = await getDatabase();
  const apartments = await db.getAllAsync<Apartment>(
    'SELECT id, number, owner_name, active FROM apartments ORDER BY number',
  );
  const charges = await db.getAllAsync<{
    id: number;
    apartment_id: number;
    month: string;
    amount_due: number;
    paid: number;
    special_id: number | null;
  }>(
    `SELECT c.id, c.apartment_id, c.month, c.amount_due, c.special_id,
      COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid
     FROM charges c LEFT JOIN payments p ON p.charge_id = c.id
     WHERE c.type = 'monthly' AND c.month >= ? AND c.month <= ?
     GROUP BY c.id`,
    `${year}-01`,
    `${year}-12`,
  );
  const byApartmentMonth = new Map(
    charges.map((charge) => [`${charge.apartment_id}:${charge.month}`, charge]),
  );

  return apartments.map((apartment) => {
    const months: Record<string, ChargeSummary | null> = {};
    for (let monthNumber = 1; monthNumber <= 12; monthNumber += 1) {
      const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
      const charge = byApartmentMonth.get(`${apartment.id}:${month}`);
      months[month] = charge
        ? {
            chargeId: charge.id,
            apartmentId: charge.apartment_id,
            type: 'monthly',
            month,
            specialId: null,
            due: charge.amount_due,
            paid: charge.paid,
            remaining: Math.max(0, charge.amount_due - charge.paid),
            status: statusFor(charge.amount_due, charge.paid),
          }
        : null;
    }
    return { apartment, months };
  });
}

export function getMonthAfter(month: string, offset: number): string {
  assertMonth(month);
  return shiftMonth(month, offset);
}
