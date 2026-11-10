import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { getDatabase, subscribeToDirty } from '@/db/schema';
import { getSetting } from '@/db/settings';

export interface SyncStatus {
  state: 'unbound' | 'synced' | 'waiting' | 'failed';
  lastSyncedAt: string | null;
  error: string | null;
}

interface MonthlyChargeRow {
  apartmentNumber: string;
  ownerName: string;
  month: string;
  due: number;
  paid: number;
}

const REQUEST_TIMEOUT_MS = 15_000;
const DEBOUNCE_MS = 3_000;
const statusListeners = new Set<() => void>();
let mutationVersion = 0;
let activeSync: Promise<void> | null = null;

function notifyStatusChanged(): void {
  statusListeners.forEach((listener) => listener());
}

function shortArabicError(error: unknown): string {
  if (error instanceof Error && /timeout|aborted/i.test(error.message)) {
    return 'انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مرة أخرى.';
  }
  if (error instanceof Error && /secret|رمز الاتصال/i.test(error.message)) {
    return 'رمز الاتصال غير صحيح.';
  }
  if (error instanceof Error && error.message.startsWith('تعذر')) return error.message;
  return 'تعذر الاتصال بالجدول. تحقق من الإنترنت والرابط والرمز.';
}

function statusFromValues(
  url: string | null,
  dirty: string | null,
  error: string | null,
  lastSyncedAt: string | null,
): SyncStatus {
  if (!url?.trim()) return { state: 'unbound', lastSyncedAt, error: null };
  if (error) return { state: 'failed', lastSyncedAt, error };
  if (dirty === '1') return { state: 'waiting', lastSyncedAt, error: null };
  return { state: 'synced', lastSyncedAt, error: null };
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM settings
     WHERE key IN ('sheet_url', 'dirty', 'last_sync_error', 'last_synced_at')`,
  );
  const settings = new Map(rows.map(({ key, value }) => [key, value]));
  return statusFromValues(
    settings.get('sheet_url') ?? null,
    settings.get('dirty') ?? '0',
    settings.get('last_sync_error') || null,
    settings.get('last_synced_at') || null,
  );
}

export function subscribeToSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export async function buildSnapshot() {
  const db = await getDatabase();
  const [
    building,
    apartments,
    paymentsByMonth,
    expensesByMonth,
    monthlyCharges,
    collectionRows,
    specialCharges,
    expenses,
    payments,
    adjustments,
    adjustmentsByMonth,
    totals,
  ] = await Promise.all([
    getSetting('building_name'),
    db.getAllAsync<{ number: string; ownerName: string }>(
      'SELECT number, owner_name AS ownerName FROM apartments ORDER BY number',
    ),
    db.getAllAsync<{ month: string; collected: number }>(
      `SELECT substr(paid_date, 1, 7) AS month, SUM(amount) AS collected
       FROM payments WHERE deleted = 0 GROUP BY substr(paid_date, 1, 7)`,
    ),
    db.getAllAsync<{ month: string; expenses: number }>(
      `SELECT month, SUM(amount) AS expenses FROM expenses
       WHERE deleted = 0 GROUP BY month`,
    ),
    db.getAllAsync<MonthlyChargeRow>(
      `SELECT a.number AS apartmentNumber, a.owner_name AS ownerName, c.month,
        c.amount_due AS due,
        COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid
       FROM charges c
       JOIN apartments a ON a.id = c.apartment_id
       LEFT JOIN payments p ON p.charge_id = c.id
       WHERE c.type = 'monthly'
       GROUP BY c.id, a.id
       ORDER BY c.month, a.number`,
    ),
    db.getAllAsync<{ id: number; title: string }>(
      'SELECT id, title FROM special_collections ORDER BY date, id',
    ),
    db.getAllAsync<{
      specialId: number;
      title: string;
      apartmentNumber: string;
      ownerName: string;
      due: number;
      paid: number;
    }>(
      `SELECT s.id AS specialId, s.title, a.number AS apartmentNumber, a.owner_name AS ownerName,
        c.amount_due AS due,
        COALESCE(SUM(CASE WHEN p.deleted = 0 THEN p.amount ELSE 0 END), 0) AS paid
       FROM special_collections s
       JOIN charges c ON c.special_id = s.id AND c.type = 'special'
       JOIN apartments a ON a.id = c.apartment_id
       LEFT JOIN payments p ON p.charge_id = c.id
       GROUP BY s.id, c.id, a.id
       ORDER BY s.date, s.id, a.number`,
    ),
    db.getAllAsync<{
      date: string;
      category: string;
      amount: number;
      note: string;
      linkedCollection: string | null;
    }>(
      `SELECT e.expense_date AS date, cat.name AS category, e.amount, e.note,
        s.title AS linkedCollection
       FROM expenses e
       JOIN expense_categories cat ON cat.id = e.category_id
       LEFT JOIN special_collections s ON s.id = e.special_id
       WHERE e.deleted = 0
       ORDER BY e.expense_date, e.id`,
    ),
    db.getAllAsync<{
      date: string;
      apartmentNumber: string;
      ownerName: string;
      type: 'monthly' | 'special';
      month: string | null;
      specialTitle: string | null;
      amount: number;
    }>(
      `SELECT p.paid_date AS date, a.number AS apartmentNumber, a.owner_name AS ownerName,
        c.type, c.month, s.title AS specialTitle, p.amount
       FROM payments p
       JOIN charges c ON c.id = p.charge_id
       JOIN apartments a ON a.id = c.apartment_id
       LEFT JOIN special_collections s ON s.id = c.special_id
       WHERE p.deleted = 0
       ORDER BY p.paid_date, p.id`,
    ),
    db.getAllAsync<{
       date: string;
       type: 'increase' | 'decrease';
       amount: number;
       reason: string;
       status: 'active' | 'cancelled';
       cancelReason: string | null;
    }>(
       `SELECT adjustment_date AS date, type, amount, reason, status,
         cancel_reason AS cancelReason
        FROM adjustments ORDER BY adjustment_date DESC, id DESC`,
    ),
    db.getAllAsync<{ month: string; total: number }>(
       `SELECT month, SUM(CASE WHEN type = 'increase' THEN amount ELSE -amount END) AS total
        FROM adjustments WHERE status = 'active' GROUP BY month`,
    ),
    db.getFirstAsync<{ paymentTotal: number; adjustmentTotal: number; totalExpenses: number }>(
       `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE deleted = 0) AS paymentTotal,
         (SELECT COALESCE(SUM(CASE WHEN type = 'increase' THEN amount ELSE -amount END), 0)
          FROM adjustments WHERE status = 'active') AS adjustmentTotal,
         (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE deleted = 0) AS totalExpenses`,
    ),
  ]);

  const monthTotals = new Map<string, { month: string; collected: number; expenses: number }>();
  for (const row of paymentsByMonth) {
    monthTotals.set(row.month, { month: row.month, collected: row.collected, expenses: 0 });
  }
  for (const row of expensesByMonth) {
    const current = monthTotals.get(row.month) ?? { month: row.month, collected: 0, expenses: 0 };
    current.expenses = row.expenses;
    monthTotals.set(row.month, current);
  }
  for (const row of adjustmentsByMonth) {
    const current = monthTotals.get(row.month) ?? { month: row.month, collected: 0, expenses: 0 };
    current.collected += row.total;
    monthTotals.set(row.month, current);
  }

  const years = new Map<number, Map<string, {
    number: string;
    ownerName: string;
    months: Record<string, { paid: number; due: number; status: string }>;
    totalPaid: number;
    totalRemaining: number;
  }>>();
  for (const charge of monthlyCharges) {
    const year = Number(charge.month.slice(0, 4));
    const month = charge.month.slice(5, 7);
    let apartmentsForYear = years.get(year);
    if (!apartmentsForYear) {
      apartmentsForYear = new Map();
      years.set(year, apartmentsForYear);
    }
    let apartment = apartmentsForYear.get(charge.apartmentNumber);
    if (!apartment) {
      apartment = {
        number: charge.apartmentNumber,
        ownerName: charge.ownerName,
        months: {},
        totalPaid: 0,
        totalRemaining: 0,
      };
      apartmentsForYear.set(charge.apartmentNumber, apartment);
    }
    const paid = Number(charge.paid) || 0;
    const due = Number(charge.due) || 0;
    apartment.months[month] = {
      paid,
      due,
      status: paid >= due ? 'مدفوع' : paid > 0 ? 'جزئي' : 'لم يدفع',
    };
    apartment.totalPaid += paid;
    apartment.totalRemaining += Math.max(0, due - paid);
  }

  const collections = new Map<number, {
    id: number;
    title: string;
    apartments: {
      number: string;
      ownerName: string;
      due: number;
      paid: number;
      remaining: number;
      status: string;
    }[];
  }>();
  for (const row of collectionRows) {
    collections.set(row.id, { id: row.id, title: row.title, apartments: [] });
  }
  for (const charge of specialCharges) {
    let collection = collections.get(charge.specialId);
    if (!collection) {
      collection = { id: charge.specialId, title: charge.title, apartments: [] };
      collections.set(charge.specialId, collection);
    }
    const paid = Number(charge.paid) || 0;
    const due = Number(charge.due) || 0;
    collection.apartments.push({
      number: charge.apartmentNumber,
      ownerName: charge.ownerName,
      due,
      paid,
      remaining: Math.max(0, due - paid),
      status: paid >= due ? 'مدفوع' : paid > 0 ? 'جزئي' : 'لم يدفع',
    });
  }

  const paymentTotal = totals?.paymentTotal ?? 0;
  const adjustmentTotal = totals?.adjustmentTotal ?? 0;
  const totalCollected = paymentTotal + adjustmentTotal;
  const totalExpenses = totals?.totalExpenses ?? 0;
  return {
    summary: {
      buildingName: building ?? '',
      generatedAt: new Date().toISOString(),
      collectedFromPayments: paymentTotal,
      netAdjustments: adjustmentTotal,
      totalCollected,
      totalExpenses,
      balance: totalCollected - totalExpenses,
    },
    monthlySummary: [...monthTotals.values()].sort((a, b) => a.month.localeCompare(b.month)),
    monthlyMatrix: [...years.entries()]
      .sort(([yearA], [yearB]) => yearA - yearB)
      .map(([year, yearApartments]) => ({
        year,
        apartments: [...yearApartments.values()].sort((a, b) => a.number.localeCompare(b.number)),
      })),
    specialCollections: [...collections.values()],
    expenses: expenses.map((item) => ({
      ...item,
      linkedCollection: item.linkedCollection ?? '',
    })),
    payments: payments.map((item) => ({
      date: item.date,
      apartmentNumber: item.apartmentNumber,
      ownerName: item.ownerName,
      type: item.type === 'monthly' ? 'اشتراك شهري' : 'تحصيل خاص',
      monthOrCollection: item.month ?? item.specialTitle ?? '',
      amount: item.amount,
    })),
    adjustments: adjustments.map((item) => ({
      date: item.date,
      type: item.type === 'increase' ? 'زيادة' : 'نقص',
      amount: item.amount,
      reason: item.reason,
      status: item.status === 'active' ? 'سارية' : 'ملغية',
      cancelReason: item.cancelReason ?? '',
    })),
    apartments,
  };
}

async function postRequest(action: 'ping' | 'sync', data?: Awaited<ReturnType<typeof buildSnapshot>>): Promise<void> {
  const url = (await getSetting('sheet_url'))?.trim() ?? '';
  const secret = (await getSetting('sheet_secret')) ?? '';
  if (!url || !secret) throw new Error('أدخل رابط الجدول والرمز السري أولاً.');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(url)) {
    throw new Error('رابط الجدول غير صحيح. استخدم رابط تطبيق الويب المنتهي بـ /exec.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, action, ...(data ? { data } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`تعذر الاتصال بالجدول (HTTP ${response.status}).`);
    const result = await response.json() as { ok?: boolean; error?: string };
    if (result.ok !== true) throw new Error(result.error || 'تعذر تحديث الجدول.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function pingSheet(): Promise<void> {
  try {
    await postRequest('ping');
  } catch (error) {
    throw new Error(shortArabicError(error));
  }
}

async function performSyncNow(): Promise<void> {
  const versionAtStart = mutationVersion;
  try {
    const snapshot = await buildSnapshot();
    await postRequest('sync', snapshot);
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES ('last_synced_at', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        new Date().toISOString(),
      );
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES ('last_sync_error', '')
         ON CONFLICT(key) DO UPDATE SET value = ''`,
      );
      if (mutationVersion === versionAtStart) {
        await db.runAsync(
          `INSERT INTO settings (key, value) VALUES ('dirty', '0')
           ON CONFLICT(key) DO UPDATE SET value = '0'`,
        );
      }
    });
    notifyStatusChanged();
  } catch (error) {
    const message = shortArabicError(error);
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES ('dirty', '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'`,
      );
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES ('last_sync_error', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        message,
      );
    });
    notifyStatusChanged();
    throw new Error(message);
  }
}

export function syncNow(): Promise<void> {
  if (!activeSync) {
    activeSync = performSyncNow().finally(() => {
      activeSync = null;
    });
  }
  return activeSync;
}

export function startAutoSync(): () => void {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncRunning = false;

  const runIfDirty = async () => {
    if (disposed || syncRunning) return;
    try {
      const [dirty, url, network] = await Promise.all([
        getSetting('dirty'),
        getSetting('sheet_url'),
        NetInfo.fetch(),
      ]);
      if (dirty !== '1' || !url?.trim()) return;
      if (network.isConnected !== true || network.isInternetReachable === false) return;
      const versionAtStart = mutationVersion;
      syncRunning = true;
      try {
        await syncNow();
      } catch {
        // The error is persisted for the status screen and the next retry.
      } finally {
        syncRunning = false;
        if (!disposed && mutationVersion !== versionAtStart) schedule();
      }
    } catch (error) {
      console.error('تعذر التحقق من حالة التحديث التلقائي.', error);
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runIfDirty();
    }, DEBOUNCE_MS);
  };

  const unsubscribe = subscribeToDirty(() => {
    mutationVersion += 1;
    notifyStatusChanged();
    schedule();
  });
  const appStateListener = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') void runIfDirty();
  });
  const unsubscribeNetwork = NetInfo.addEventListener((state) => {
    if (state.isConnected === true && state.isInternetReachable !== false) schedule();
  });
  void runIfDirty();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    unsubscribe();
    unsubscribeNetwork();
    appStateListener.remove();
  };
}
