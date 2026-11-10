import { getDatabase, markDirty } from './schema';

export interface Expense {
  id: number;
  category_id: number;
  amount: number;
  expense_date: string;
  month: string;
  note: string;
  special_id: number | null;
  deleted: number;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  is_fixed: number;
  active: number;
}

export async function addExpense(values: Omit<Expense, 'id' | 'deleted'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO expenses
     (category_id, amount, expense_date, month, note, special_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    values.category_id,
    values.amount,
    values.expense_date,
    values.month,
    values.note,
    values.special_id,
  );
  await markDirty(db);
  return result.lastInsertRowId;
}

export async function saveFixedExpense(
  categoryId: number,
  month: string,
  amount: number | null,
  expenseDate: string,
): Promise<void> {
  const db = await getDatabase();
  const existing = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM expenses
     WHERE category_id = ? AND month = ? AND deleted = 0
     ORDER BY id`,
    categoryId,
    month,
  );
  if (amount === null) {
    await db.runAsync(
      'UPDATE expenses SET deleted = 1 WHERE category_id = ? AND month = ? AND deleted = 0',
      categoryId,
      month,
    );
  } else if (existing[0]) {
    await db.runAsync(
      `UPDATE expenses SET amount = ?, expense_date = ?, note = '', special_id = NULL
       WHERE id = ?`,
      amount,
      expenseDate,
      existing[0].id,
    );
    if (existing.length > 1) {
      await db.runAsync(
        `UPDATE expenses SET deleted = 1
         WHERE category_id = ? AND month = ? AND deleted = 0 AND id != ?`,
        categoryId,
        month,
        existing[0].id,
      );
    }
  } else {
    await db.runAsync(
      `INSERT INTO expenses
       (category_id, amount, expense_date, month, note, special_id)
       VALUES (?, ?, ?, ?, '', NULL)`,
      categoryId,
      amount,
      expenseDate,
      month,
    );
  }
  await markDirty(db);
}

export async function updateExpense(
  id: number,
  values: Omit<Expense, 'id' | 'deleted'>,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE expenses SET category_id = ?, amount = ?, expense_date = ?,
     month = ?, note = ?, special_id = ? WHERE id = ? AND deleted = 0`,
    values.category_id,
    values.amount,
    values.expense_date,
    values.month,
    values.note,
    values.special_id,
    id,
  );
  await markDirty(db);
}

export async function listExpenses(month?: string): Promise<Expense[]> {
  const db = await getDatabase();
  return db.getAllAsync<Expense>(
    `SELECT id, category_id, amount, expense_date, month, note, special_id, deleted
     FROM expenses WHERE deleted = 0 ${month === undefined ? '' : 'AND month = ?'}
     ORDER BY expense_date, id`,
    ...(month === undefined ? [] : [month]),
  );
}

export async function softDeleteExpense(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE expenses SET deleted = 1 WHERE id = ?', id);
  await markDirty(db);
}

export async function addExpenseCategory(name: string, isFixed: boolean): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO expense_categories (name, is_fixed) VALUES (?, ?)',
    name.trim(),
    isFixed ? 1 : 0,
  );
  await markDirty(db);
  return result.lastInsertRowId;
}

export async function updateExpenseCategory(
  id: number,
  name: string,
  isFixed: boolean,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE expense_categories SET name = ?, is_fixed = ? WHERE id = ?',
    name.trim(),
    isFixed ? 1 : 0,
    id,
  );
  await markDirty(db);
}

export async function listExpenseCategories(includeInactive = false): Promise<ExpenseCategory[]> {
  const db = await getDatabase();
  return db.getAllAsync<ExpenseCategory>(
    `SELECT id, name, is_fixed, active FROM expense_categories
     ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY is_fixed DESC, name`,
  );
}

export async function getMonthlyExpenseTotal(month: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE deleted = 0 AND month = ?',
    month,
  );
  return row?.total ?? 0;
}

export async function softDeleteExpenseCategory(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE expense_categories SET active = 0 WHERE id = ?', id);
  await markDirty(db);
}
