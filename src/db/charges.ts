import { getDatabase, markDirty } from './schema';

export type ChargeType = 'monthly' | 'special';

export interface Charge {
  id: number;
  apartment_id: number;
  type: ChargeType;
  month: string | null;
  special_id: number | null;
  amount_due: number;
}

export async function addCharge(
  apartmentId: number,
  type: ChargeType,
  amountDue: number,
  month: string | null = null,
  specialId: number | null = null,
): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO charges (apartment_id, type, month, special_id, amount_due) VALUES (?, ?, ?, ?, ?)',
    apartmentId,
    type,
    month,
    specialId,
    amountDue,
  );
  await markDirty(db);
  return result.lastInsertRowId;
}

export async function updateChargeAmount(id: number, amountDue: number): Promise<void> {
  if (!Number.isFinite(amountDue) || amountDue < 0) {
    throw new Error('Charge amount must be zero or more.');
  }
  const db = await getDatabase();
  await db.runAsync('UPDATE charges SET amount_due = ? WHERE id = ?', amountDue, id);
  await markDirty(db);
}

export async function listCharges(filters: {
  apartmentId?: number;
  month?: string;
  specialId?: number;
} = {}): Promise<Charge[]> {
  const db = await getDatabase();
  const conditions: string[] = [];
  if (filters.apartmentId !== undefined) {
    conditions.push('apartment_id = ?');
  }
  if (filters.month !== undefined) {
    conditions.push("type = 'monthly' AND month = ?");
  }
  if (filters.specialId !== undefined) {
    conditions.push("type = 'special' AND special_id = ?");
  }
  const filterValues = [
    ...(filters.apartmentId !== undefined ? [filters.apartmentId] : []),
    ...(filters.month !== undefined ? [filters.month] : []),
    ...(filters.specialId !== undefined ? [filters.specialId] : []),
  ];
  return db.getAllAsync<Charge>(
    `SELECT id, apartment_id, type, month, special_id, amount_due FROM charges
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY month, apartment_id`,
    filterValues,
  );
}
