import { getDatabase, markDirty } from '@/db/schema';

export interface SpecialCollectionSummary {
  id: number;
  title: string;
  amountPerApartment: number;
  date: string;
  note: string;
  active: number;
  totalTarget: number;
  totalCollected: number;
  linkedExpenses: number;
}

export interface SpecialApartmentSummary {
  chargeId: number;
  apartmentId: number;
  apartmentNumber: string;
  ownerName: string;
  due: number;
  paid: number;
  remaining: number;
  status: 'paid' | 'partial' | 'unpaid';
}

export async function listSpecialCollectionSummaries(
  includeInactive = false,
): Promise<SpecialCollectionSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SpecialCollectionSummary>(
    `SELECT s.id, s.title, s.amount_per_apartment AS amountPerApartment,
      s.date, s.note, s.active,
      COALESCE((SELECT SUM(c.amount_due) FROM charges c
        WHERE c.special_id = s.id AND c.type = 'special'), 0) AS totalTarget,
      COALESCE((SELECT SUM(p.amount) FROM payments p
        JOIN charges c ON c.id = p.charge_id
        WHERE c.special_id = s.id AND c.type = 'special' AND p.deleted = 0), 0) AS totalCollected,
      COALESCE((SELECT SUM(e.amount) FROM expenses e
        WHERE e.special_id = s.id AND e.deleted = 0), 0) AS linkedExpenses
     FROM special_collections s
     ${includeInactive ? '' : 'WHERE s.active = 1'}
     ORDER BY s.date DESC, s.id DESC`,
  );
  return rows;
}

export async function getSpecialApartmentSummaries(
  specialId: number,
): Promise<SpecialApartmentSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    apartment_id: number;
    number: string;
    owner_name: string;
    amount_due: number;
    paid: number;
  }>(
    `SELECT c.id, c.apartment_id, a.number, a.owner_name, c.amount_due,
      COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid
     FROM charges c
     JOIN apartments a ON a.id = c.apartment_id
     LEFT JOIN payments p ON p.charge_id = c.id
     WHERE c.special_id = ? AND c.type = 'special'
     GROUP BY c.id, a.id
     ORDER BY a.number`,
    specialId,
  );
  return rows.map((row) => ({
    chargeId: row.id,
    apartmentId: row.apartment_id,
    apartmentNumber: row.number,
    ownerName: row.owner_name,
    due: row.amount_due,
    paid: row.paid,
    remaining: Math.max(0, row.amount_due - row.paid),
    status: row.paid >= row.amount_due ? 'paid' : row.paid > 0 ? 'partial' : 'unpaid',
  }));
}

export async function updateSpecialApartmentAmount(
  chargeId: number,
  amountDue: number,
): Promise<void> {
  if (!Number.isFinite(amountDue) || amountDue < 0) {
    throw new Error('Special collection amount must be zero or more.');
  }
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ paid: number }>(
    `SELECT COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid
     FROM charges c LEFT JOIN payments p ON p.charge_id = c.id
     WHERE c.id = ? AND c.type = 'special'
     GROUP BY c.id`,
    chargeId,
  );
  if (!row) throw new Error('Special collection charge was not found.');
  if (amountDue < row.paid) {
    throw new Error('New amount cannot be less than the amount already collected.');
  }
  await db.runAsync('UPDATE charges SET amount_due = ? WHERE id = ?', amountDue, chargeId);
  await markDirty(db);
}
