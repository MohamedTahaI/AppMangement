import { getDatabase, markDirty } from './schema';

export type AdjustmentType = 'increase' | 'decrease';
export type AdjustmentStatus = 'active' | 'cancelled';

export interface Adjustment {
  id: number;
  type: AdjustmentType;
  amount: number;
  reason: string;
  adjustment_date: string;
  month: string;
  status: AdjustmentStatus;
  cancel_reason: string | null;
  created_at: string;
}

export interface NewAdjustment {
  type: AdjustmentType;
  amount: number;
  reason: string;
  adjustmentDate: string;
}

function validateDate(value: string): void {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('تاريخ تعديل الرصيد غير صحيح.');
  }
}

export async function listAdjustments(): Promise<Adjustment[]> {
  const db = await getDatabase();
  return db.getAllAsync<Adjustment>(
    'SELECT * FROM adjustments ORDER BY adjustment_date DESC, id DESC',
  );
}

export async function addAdjustment(values: NewAdjustment): Promise<number> {
  const reason = values.reason.trim();
  validateDate(values.adjustmentDate);
  if (values.type !== 'increase' && values.type !== 'decrease') {
    throw new Error('نوع تعديل الرصيد غير صحيح.');
  }
  if (!Number.isFinite(values.amount) || values.amount <= 0) {
    throw new Error('أدخل مبلغاً أكبر من صفر.');
  }
  if (reason.length < 3) throw new Error('سبب تعديل الرصيد مطلوب (3 أحرف على الأقل).');

  const db = await getDatabase();
  let adjustmentId = 0;
  await db.withTransactionAsync(async () => {
    if (values.type === 'decrease') {
      const totals = await db.getFirstAsync<{ collected: number }>(
        `SELECT
          (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE deleted = 0)
          + COALESCE(SUM(CASE WHEN type = 'increase' THEN amount ELSE -amount END), 0)
          AS collected
         FROM adjustments WHERE status = 'active'`,
      );
      if (values.amount > (totals?.collected ?? 0)) {
        throw new Error('لا يمكن أن يصبح إجمالي التحصيل بعد التعديل أقل من صفر.');
      }
    }

    const result = await db.runAsync(
      `INSERT INTO adjustments (type, amount, reason, adjustment_date, month)
       VALUES (?, ?, ?, ?, ?)`,
      values.type,
      values.amount,
      reason,
      values.adjustmentDate,
      values.adjustmentDate.slice(0, 7),
    );
    adjustmentId = result.lastInsertRowId;
    await markDirty(db);
  });
  return adjustmentId;
}

export async function cancelAdjustment(id: number, cancelReason: string): Promise<void> {
  const reason = cancelReason.trim();
  if (!Number.isInteger(id) || id < 1) throw new Error('رقم تعديل الرصيد غير صحيح.');
  if (reason.length < 3) throw new Error('سبب الإلغاء مطلوب (3 أحرف على الأقل).');

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const adjustment = await db.getFirstAsync<{ type: AdjustmentType; amount: number }>(
      "SELECT type, amount FROM adjustments WHERE id = ? AND status = 'active'",
      id,
    );
    if (!adjustment) throw new Error('تعديل الرصيد غير موجود أو سبق إلغاؤه.');
    if (adjustment.type === 'increase') {
      const totals = await db.getFirstAsync<{ collected: number }>(
        `SELECT
          (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE deleted = 0)
          + COALESCE(SUM(CASE WHEN type = 'increase' THEN amount ELSE -amount END), 0)
          AS collected
         FROM adjustments WHERE status = 'active'`,
      );
      if (adjustment.amount > (totals?.collected ?? 0)) {
        throw new Error('لا يمكن إلغاء هذه الزيادة لأنها ستجعل إجمالي التحصيل أقل من صفر.');
      }
    }
    await db.runAsync(
      `UPDATE adjustments SET status = 'cancelled', cancel_reason = ?
       WHERE id = ? AND status = 'active'`,
      reason,
      id,
    );
    await markDirty(db);
  });
}
