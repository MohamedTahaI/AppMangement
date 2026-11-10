import { getDatabase, markDirty } from './schema';

export interface SpecialCollection {
  id: number;
  title: string;
  amount_per_apartment: number;
  date: string;
  note: string;
  active: number;
}

export async function addSpecialCollection(values: {
  title: string;
  amount_per_apartment: number;
  date: string;
  note?: string;
}): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO special_collections (title, amount_per_apartment, date, note)
     VALUES (?, ?, ?, ?)`,
    values.title.trim(),
    values.amount_per_apartment,
    values.date,
    values.note ?? '',
  );
  await markDirty(db);
  return result.lastInsertRowId;
}

export async function updateSpecialCollection(
  id: number,
  values: Pick<SpecialCollection, 'title' | 'amount_per_apartment' | 'date' | 'note' | 'active'>,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE special_collections
     SET title = ?, amount_per_apartment = ?, date = ?, note = ?, active = ?
     WHERE id = ?`,
    values.title.trim(),
    values.amount_per_apartment,
    values.date,
    values.note,
    values.active ? 1 : 0,
    id,
  );
  await markDirty(db);
}

export async function listSpecialCollections(includeInactive = false): Promise<SpecialCollection[]> {
  const db = await getDatabase();
  return db.getAllAsync<SpecialCollection>(
    `SELECT id, title, amount_per_apartment, date, note, active
     FROM special_collections ${includeInactive ? '' : 'WHERE active = 1'}
     ORDER BY date DESC, id DESC`,
  );
}

export async function softDeleteSpecialCollection(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE special_collections SET active = 0 WHERE id = ?', id);
  await markDirty(db);
}
