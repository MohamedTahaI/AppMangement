import { getDatabase, markDirty } from './schema';

export interface Payment {
  id: number;
  charge_id: number;
  amount: number;
  paid_date: string;
  note: string;
  deleted: number;
  created_at: string;
}

export interface ApartmentPayment extends Payment {
  apartment_id: number;
  type: 'monthly' | 'special';
  month: string | null;
  special_title: string | null;
}

export async function addPayment(
  chargeId: number,
  amount: number,
  paidDate: string,
  note = '',
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO payments (charge_id, amount, paid_date, note) VALUES (?, ?, ?, ?)',
    chargeId,
    amount,
    paidDate,
    note,
  );
  await markDirty(db);
  return result.lastInsertRowId;
}

export async function updatePayment(
  id: number,
  values: Pick<Payment, 'amount' | 'paid_date' | 'note'>,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE payments SET amount = ?, paid_date = ?, note = ? WHERE id = ? AND deleted = 0',
    values.amount,
    values.paid_date,
    values.note,
    id,
  );
  await markDirty(db);
}

export async function listPayments(chargeId?: number): Promise<Payment[]> {
  const db = await getDatabase();
  return db.getAllAsync<Payment>(
    `SELECT id, charge_id, amount, paid_date, note, deleted, created_at FROM payments
     WHERE deleted = 0 ${chargeId === undefined ? '' : 'AND charge_id = ?'}
     ORDER BY paid_date, id`,
    ...(chargeId === undefined ? [] : [chargeId]),
  );
}

export async function listApartmentPayments(apartmentId: number): Promise<ApartmentPayment[]> {
  const db = await getDatabase();
  return db.getAllAsync<ApartmentPayment>(
    `SELECT p.id, p.charge_id, p.amount, p.paid_date, p.note, p.deleted, p.created_at,
      c.apartment_id, c.type, c.month, s.title AS special_title
     FROM payments p
     JOIN charges c ON c.id = p.charge_id
     LEFT JOIN special_collections s ON s.id = c.special_id
     WHERE c.apartment_id = ? AND p.deleted = 0
     ORDER BY p.paid_date DESC, p.id DESC`,
    apartmentId,
  );
}

export async function softDeletePayment(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE payments SET deleted = 1 WHERE id = ?', id);
  await markDirty(db);
}
