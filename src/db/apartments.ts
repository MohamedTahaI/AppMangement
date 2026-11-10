import { getDatabase, markDirty } from './schema';

export interface Apartment {
  id: number;
  number: string;
  owner_name: string;
  active: number;
}

export async function addApartment(number: string, ownerName = ''): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO apartments (number, owner_name) VALUES (?, ?)',
    number.trim(),
    ownerName.trim(),
  );
  await markDirty(db);
  return result.lastInsertRowId;
}

export async function updateApartment(
  id: number,
  values: Pick<Apartment, 'number' | 'owner_name' | 'active'>,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE apartments SET number = ?, owner_name = ?, active = ? WHERE id = ?',
    values.number.trim(),
    values.owner_name.trim(),
    values.active ? 1 : 0,
    id,
  );
  await markDirty(db);
}

export async function listApartments(includeInactive = false): Promise<Apartment[]> {
  const db = await getDatabase();
  return db.getAllAsync<Apartment>(
    `SELECT id, number, owner_name, active FROM apartments
     ${includeInactive ? '' : 'WHERE active = 1'}
     ORDER BY number`,
  );
}

export async function softDeleteApartment(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE apartments SET active = 0 WHERE id = ?', id);
  await markDirty(db);
}
