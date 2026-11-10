import { getDatabase, markDirty } from './schema';

export interface FeeRate {
  id: number;
  effective_from: string;
  amount: number;
}

export async function addFeeRate(effectiveFrom: string, amount: number): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO fee_rates (effective_from, amount) VALUES (?, ?)',
    effectiveFrom,
    amount,
  );
  await markDirty(db);
  return result.lastInsertRowId;
}

export async function updateFeeRate(
  id: number,
  effectiveFrom: string,
  amount: number,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE fee_rates SET effective_from = ?, amount = ? WHERE id = ?',
    effectiveFrom,
    amount,
    id,
  );
  await markDirty(db);
}

export async function setFeeRate(effectiveFrom: string, amount: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO fee_rates (effective_from, amount) VALUES (?, ?)
     ON CONFLICT(effective_from) DO UPDATE SET amount = excluded.amount`,
    effectiveFrom,
    amount,
  );
  await markDirty(db);
}

export async function listFeeRates(): Promise<FeeRate[]> {
  const db = await getDatabase();
  return db.getAllAsync<FeeRate>(
    'SELECT id, effective_from, amount FROM fee_rates ORDER BY effective_from',
  );
}
