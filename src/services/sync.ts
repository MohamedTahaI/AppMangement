import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { getDatabase, subscribeToDirty } from '@/db/schema';
import { getSetting } from '@/db/settings';
import { getReportData } from './reportData';
import { buildSheetRows } from './sheetRows';

export interface SyncStatus {
  state: 'unbound' | 'synced' | 'waiting' | 'failed';
  lastSyncedAt: string | null;
  error: string | null;
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
  if (error) return { state: 'failed', lastSyncedAt, error: shortArabicError(new Error(error)) };
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
  const report = await getReportData({ kind: 'all' });
  return buildSheetRows(report);
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
      if (__DEV__) console.log('تعذر التحقق من حالة التحديث التلقائي.', error);
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
