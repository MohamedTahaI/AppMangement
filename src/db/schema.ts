import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'building-finance.db';
const SCHEMA_VERSION = 2;

const INITIAL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS apartments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    owner_name TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS fee_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    effective_from TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL CHECK (amount >= 0)
  );

  CREATE TABLE IF NOT EXISTS special_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    amount_per_apartment REAL NOT NULL CHECK (amount_per_apartment >= 0),
    date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS charges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apartment_id INTEGER NOT NULL REFERENCES apartments(id),
    type TEXT NOT NULL CHECK (type IN ('monthly', 'special')),
    month TEXT,
    special_id INTEGER REFERENCES special_collections(id),
    amount_due REAL NOT NULL CHECK (amount_due >= 0),
    CHECK (
      (type = 'monthly' AND month IS NOT NULL AND special_id IS NULL)
      OR (type = 'special' AND month IS NULL AND special_id IS NOT NULL)
    )
  );
  CREATE UNIQUE INDEX IF NOT EXISTS charges_monthly_unique
    ON charges(apartment_id, month) WHERE type = 'monthly';
  CREATE UNIQUE INDEX IF NOT EXISTS charges_special_unique
    ON charges(apartment_id, special_id) WHERE type = 'special';

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    charge_id INTEGER NOT NULL REFERENCES charges(id),
    amount REAL NOT NULL CHECK (amount > 0),
    paid_date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_fixed INTEGER NOT NULL DEFAULT 0 CHECK (is_fixed IN (0, 1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    amount REAL NOT NULL CHECK (amount >= 0),
    expense_date TEXT NOT NULL,
    month TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    special_id INTEGER REFERENCES special_collections(id),
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('increase', 'decrease')),
    amount REAL NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
    adjustment_date TEXT NOT NULL,
    month TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    cancel_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sync_state (
    tab_key TEXT NOT NULL,
    row_key TEXT NOT NULL,
    row_hash TEXT NOT NULL,
    PRIMARY KEY (tab_key, row_key)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const DEFAULT_CATEGORIES = [
  ['مرتب الحارس', 1],
  ['القمامة', 1],
  ['المنظفات', 1],
  ['الكهرباء', 1],
  ['المياه', 1],
  ['صيانة', 0],
  ['أخرى', 0],
] as const;

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version > SCHEMA_VERSION) {
    throw new Error(`Database version ${version} is newer than supported version ${SCHEMA_VERSION}.`);
  }
  if (version === SCHEMA_VERSION) return;

  await db.withTransactionAsync(async () => {
    await db.execAsync(INITIAL_SCHEMA);
    for (const [name, isFixed] of DEFAULT_CATEGORIES) {
      await db.runAsync(
        'INSERT OR IGNORE INTO expense_categories (name, is_fixed) VALUES (?, ?)',
        name,
        isFixed,
      );
    }

    const month = currentMonth();
    await db.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      'start_month',
      month,
    );
    for (const [key, value] of [
      ['building_name', ''],
      ['sheet_url', ''],
      ['sheet_secret', ''],
      ['last_synced_at', ''],
      ['dirty', '0'],
      ['last_backup_at', ''],
      ['last_sync_error', ''],
      ['sheet_revision', ''],
      ['sheet_schema_version', '1'],
      ['reduce_motion', '0'],
      ['backup_reminders_enabled', '1'],
      ['backup_permission_asked', '0'],
      ['sync_banner_dismissed_at', ''],
    ]) {
      await db.runAsync('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
    }
    await db.runAsync(
      'INSERT OR IGNORE INTO fee_rates (effective_from, amount) VALUES (?, ?)',
      month,
      400,
    );
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    await markDirty(db);
  });
}

let databasePromise: Promise<SQLiteDatabase> | undefined;
const dirtyListeners = new Set<() => void>();

export function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME)
      .then(async (db) => {
        await migrate(db);
        return db;
      })
      .catch((error: unknown) => {
        databasePromise = undefined;
        throw error;
      });
  }
  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
  await getDatabase();
}

export async function markDirty(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES ('dirty', '1')
     ON CONFLICT(key) DO UPDATE SET value = '1'`,
  );
  dirtyListeners.forEach((listener) => listener());
}

export function subscribeToDirty(listener: () => void): () => void {
  dirtyListeners.add(listener);
  return () => dirtyListeners.delete(listener);
}
