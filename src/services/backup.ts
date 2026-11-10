import { getDatabase, markDirty } from '@/db/schema';

export const BACKUP_FORMAT_VERSION = 2;

const TABLES = {
  apartments: ['id', 'number', 'owner_name', 'active'],
  fee_rates: ['id', 'effective_from', 'amount'],
  special_collections: ['id', 'title', 'amount_per_apartment', 'date', 'note', 'active'],
  expense_categories: ['id', 'name', 'is_fixed', 'active'],
  charges: ['id', 'apartment_id', 'type', 'month', 'special_id', 'amount_due'],
  payments: ['id', 'charge_id', 'amount', 'paid_date', 'note', 'deleted', 'created_at'],
  expenses: ['id', 'category_id', 'amount', 'expense_date', 'month', 'note', 'special_id', 'deleted'],
  adjustments: [
    'id',
    'type',
    'amount',
    'reason',
    'adjustment_date',
    'month',
    'status',
    'cancel_reason',
    'created_at',
  ],
  settings: ['key', 'value'],
} as const;

type TableName = keyof typeof TABLES;
type BackupRow = Record<string, string | number | null>;

export interface DatabaseBackup {
  formatVersion: number;
  createdAt: string;
  tables: Record<TableName, BackupRow[]>;
}

export async function createDatabaseBackup(): Promise<DatabaseBackup> {
  const db = await getDatabase();
  const tables = {} as Record<TableName, BackupRow[]>;
  for (const table of Object.keys(TABLES) as TableName[]) {
    tables[table] = await db.getAllAsync<BackupRow>(`SELECT * FROM ${table}`);
  }
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    tables,
  };
}

export function validateDatabaseBackup(value: unknown): DatabaseBackup {
  if (!value || typeof value !== 'object') throw new Error('ملف النسخة الاحتياطية غير صالح.');
  const backup = value as Partial<DatabaseBackup>;
  if (backup.formatVersion !== 1 && backup.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error('إصدار ملف النسخة الاحتياطية غير مدعوم.');
  }
  if (typeof backup.createdAt !== 'string' || Number.isNaN(Date.parse(backup.createdAt))) {
    throw new Error('تاريخ النسخة الاحتياطية غير صالح.');
  }
  if (!backup.tables || typeof backup.tables !== 'object') {
    throw new Error('بيانات الجداول غير موجودة في ملف النسخة الاحتياطية.');
  }

  const sourceTables = backup.tables as Partial<Record<TableName, BackupRow[]>>;
  const normalizedTables = { ...sourceTables, adjustments: sourceTables.adjustments ?? [] };
  for (const table of Object.keys(TABLES) as TableName[]) {
    const rows = normalizedTables[table];
    if (!Array.isArray(rows)) throw new Error(`بيانات جدول ${table} غير صالحة.`);
    const columns = TABLES[table] as readonly string[];
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`يوجد سجل غير صالح في جدول ${table}.`);
      }
      const rowObject = row as Record<string, unknown>;
      if (columns.some((column) => !(column in rowObject))) {
        throw new Error(`أعمدة جدول ${table} غير مكتملة.`);
      }
      if (Object.keys(rowObject).some((column) => !columns.includes(column))) {
        throw new Error(`يحتوي جدول ${table} على أعمدة غير معروفة.`);
      }
      if (
        Object.values(rowObject).some(
          (field) =>
            field !== null
            && typeof field !== 'string'
            && typeof field !== 'number'
            && typeof field !== 'boolean',
        )
      ) {
        throw new Error(`قيمة غير صالحة في جدول ${table}.`);
      }
    }
  }

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: backup.createdAt,
    tables: normalizedTables as Record<TableName, BackupRow[]>,
  };
}

export async function restoreDatabaseBackup(value: unknown): Promise<void> {
  const backup = validateDatabaseBackup(value);
  const db = await getDatabase();
  const deletionOrder: TableName[] = [
    'payments',
    'expenses',
    'adjustments',
    'charges',
    'apartments',
    'fee_rates',
    'special_collections',
    'expense_categories',
    'settings',
  ];
  const insertionOrder: TableName[] = [
    'apartments',
    'fee_rates',
    'special_collections',
    'expense_categories',
    'charges',
    'payments',
    'expenses',
    'adjustments',
    'settings',
  ];

  await db.withTransactionAsync(async () => {
    for (const table of deletionOrder) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
    await db.runAsync('DELETE FROM sync_state');
    for (const table of insertionOrder) {
      const columns = TABLES[table] as readonly string[];
      const placeholders = columns.map(() => '?').join(', ');
      for (const row of backup.tables[table]) {
        await db.runAsync(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
          columns.map((column) => {
            const value = row[column];
            return typeof value === 'boolean' ? Number(value) : value ?? null;
          }),
        );
      }
    }
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES ('sheet_revision', '')
       ON CONFLICT(key) DO UPDATE SET value = ''`,
    );
    const violations = await db.getAllAsync<{ table: string }>('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`النسخة تحتوي على روابط غير صحيحة في جدول ${violations[0].table}.`);
    }
    await markDirty(db);
  });
}
