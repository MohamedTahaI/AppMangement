import { getDatabase, markDirty } from './schema';

const settingListeners = new Map<string, Set<() => void>>();

export function subscribeToSettingChange(key: string, listener: () => void): () => void {
  const listeners = settingListeners.get(key) ?? new Set<() => void>();
  listeners.add(listener);
  settingListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) settingListeners.delete(key);
  };
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
  await markDirty(db);
  settingListeners.get(key)?.forEach((listener) => listener());
}

export async function listSettings(): Promise<Record<string, string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings ORDER BY key',
  );
  return Object.fromEntries(rows.map(({ key, value }) => [key, value]));
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM settings WHERE key = ?', key);
  await markDirty(db);
}
