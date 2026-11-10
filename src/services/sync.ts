import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase, subscribeToDirty } from '@/db/schema';
import { getSetting } from '@/db/settings';
import { getReportData } from './reportData';
import {
  buildSheetSnapshot,
  buildSheetSyncPayload,
  findPendingChanges,
  snapshotSyncState,
  type SheetSnapshot,
  type SheetSyncPayload,
  type SyncState,
} from './sheetRows';

export interface SyncStatus {
  state: 'unbound' | 'synced' | 'waiting' | 'failed';
  lastSyncedAt: string | null;
  error: string | null;
  pendingCount: number;
}

export interface SyncResult {
  sent: number;
  full: boolean;
}

export interface PingResult {
  revision: string;
  schemaVersion: number | null;
  rowCounts: Record<string, number>;
}

class SyncServerError extends Error {
  code: string;

  constructor(message: string, code = 'server_error') {
    super(message);
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 15_000;
const DEBOUNCE_MS = 3_000;
const statusListeners = new Set<() => void>();
let mutationVersion = 0;
let activeSync: Promise<SyncResult> | null = null;
let pendingCache: { at: number; value: number } | null = null;
let unlinkedToastPending = false;
let unlinkedToastShown = false;

function notifyStatusChanged(): void {
  statusListeners.forEach((listener) => listener());
}

function invalidatePendingCache(): void {
  pendingCache = null;
}

function shortArabicError(error: unknown): string {
  if (error instanceof Error && /timeout|aborted|network|failed to fetch/i.test(error.message)) {
    return 'انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مرة أخرى.';
  }
  if (error instanceof Error && /secret|رمز الاتصال/i.test(error.message)) {
    return 'رمز الاتصال غير صحيح.';
  }
  if (error instanceof Error && error.message.startsWith('تعذر')) return error.message;
  return 'تعذر الاتصال بالجدول. تحقق من الإنترنت والرابط والرمز.';
}

function isNetworkError(error: unknown): boolean {
  return !(error instanceof SyncServerError);
}

function statusFromValues(
  url: string | null,
  dirty: string | null,
  error: string | null,
  lastSyncedAt: string | null,
  pendingCount: number,
): SyncStatus {
  if (!url?.trim()) return { state: 'unbound', lastSyncedAt, error: null, pendingCount: 0 };
  if (error) return { state: 'failed', lastSyncedAt, error: shortArabicError(new Error(error)), pendingCount };
  if (dirty === '1' || pendingCount > 0) return { state: 'waiting', lastSyncedAt, error: null, pendingCount };
  return { state: 'synced', lastSyncedAt, error: null, pendingCount: 0 };
}

async function readSyncState(db: SQLiteDatabase): Promise<SyncState> {
  const rows = await db.getAllAsync<{ tab_key: string; row_key: string; row_hash: string }>(
    'SELECT tab_key, row_key, row_hash FROM sync_state',
  );
  const state: SyncState = new Map();
  for (const row of rows) {
    const tab = state.get(row.tab_key) ?? new Map<string, string>();
    tab.set(row.row_key, row.row_hash);
    state.set(row.tab_key, tab);
  }
  return state;
}

async function buildSnapshot(): Promise<SheetSnapshot> {
  const report = await getReportData({ kind: 'all' });
  return buildSheetSnapshot(report);
}

async function getPendingCount(): Promise<number> {
  if (pendingCache && Date.now() - pendingCache.at < 1_000) return pendingCache.value;
  const db = await getDatabase();
  const [snapshot, state] = await Promise.all([buildSnapshot(), readSyncState(db)]);
  const value = findPendingChanges(snapshot, state).count;
  pendingCache = { at: Date.now(), value };
  return value;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM settings
     WHERE key IN ('sheet_url', 'dirty', 'last_sync_error', 'last_synced_at')`,
  );
  const settings = new Map(rows.map(({ key, value }) => [key, value]));
  const url = settings.get('sheet_url') ?? null;
  const pendingCount = url?.trim() ? await getPendingCount() : 0;
  return statusFromValues(
    url,
    settings.get('dirty') ?? '0',
    settings.get('last_sync_error') || null,
    settings.get('last_synced_at') || null,
    pendingCount,
  );
}

export function subscribeToSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function takeUnlinkedToast(): boolean {
  if (!unlinkedToastPending) return false;
  unlinkedToastPending = false;
  return true;
}

async function postRequest(
  action: 'ping' | 'sync',
  data?: SheetSyncPayload,
): Promise<Record<string, unknown>> {
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
    if (!response.ok) {
      throw new SyncServerError(`تعذر الاتصال بالجدول (HTTP ${response.status}).`, 'http_error');
    }
    let result: { ok?: boolean; error?: string; code?: string };
    try {
      result = await response.json() as { ok?: boolean; error?: string; code?: string };
    } catch {
      throw new SyncServerError('استجابة الجدول غير صحيحة. تأكد من نشر السكربت الجديد.', 'invalid_response');
    }
    if (result.ok !== true) {
      throw new SyncServerError(result.error || 'تعذر تحديث الجدول.', result.code || 'server_error');
    }
    return result as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function pingSheet(): Promise<PingResult> {
  try {
    const result = await postRequest('ping');
    return {
      revision: typeof result.revision === 'string' ? result.revision : '',
      schemaVersion: typeof result.schemaVersion === 'number' ? result.schemaVersion : null,
      rowCounts: result.rowCounts && typeof result.rowCounts === 'object'
        ? result.rowCounts as Record<string, number>
        : {},
    };
  } catch (error) {
    throw new Error(shortArabicError(error));
  }
}

async function performSyncNow(forceFull: boolean): Promise<SyncResult> {
  const versionAtStart = mutationVersion;
  const db = await getDatabase();
  const [snapshot, state, savedRevision] = await Promise.all([
    buildSnapshot(),
    readSyncState(db),
    getSetting('sheet_revision'),
  ]);
  const pending = findPendingChanges(snapshot, state);
  const storedRevision = savedRevision ?? '';
  const full = forceFull || state.size === 0 || !storedRevision;

  if (pending.count === 0 && !forceFull && state.size > 0) {
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES ('dirty', '0')
       ON CONFLICT(key) DO UPDATE SET value = '0'`,
    );
    invalidatePendingCache();
    notifyStatusChanged();
    return { sent: 0, full: false };
  }

  const send = async (isFull: boolean): Promise<SyncResult> => {
    const payload = buildSheetSyncPayload(snapshot, state, isFull ? '' : storedRevision, isFull);
    try {
      await postRequest('sync', payload);
    } catch (error) {
      if (!isFull && error instanceof SyncServerError
        && ['revision_mismatch', 'sheet_damaged', 'schema_mismatch'].includes(error.code)) {
        return send(true);
      }
      throw error;
    }
    const sent = isFull ? snapshot.tabs.reduce((sum, tab) => sum + tab.rows.length, 0) : pending.count;
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM sync_state');
      for (const row of snapshotSyncState(snapshot)) {
        await db.runAsync(
          'INSERT INTO sync_state (tab_key, row_key, row_hash) VALUES (?, ?, ?)',
          row.tabKey,
          row.rowKey,
          row.hash,
        );
      }
      await db.runAsync(
        `INSERT INTO settings (key, value) VALUES ('sheet_revision', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        snapshot.revision,
      );
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
    invalidatePendingCache();
    notifyStatusChanged();
    return { sent, full: isFull };
  };

  try {
    return await send(full);
  } catch (error) {
    const message = shortArabicError(error);
    if (isNetworkError(error)) {
      invalidatePendingCache();
      notifyStatusChanged();
      throw new Error(message);
    }
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
    invalidatePendingCache();
    notifyStatusChanged();
    throw new Error(message);
  }
}

export function syncNow(options?: { full?: boolean }): Promise<SyncResult> {
  if (!activeSync) {
    activeSync = performSyncNow(options?.full === true).finally(() => {
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
      if (!url?.trim()) {
        if (!unlinkedToastShown && dirty === '1') {
          unlinkedToastShown = true;
          unlinkedToastPending = true;
          notifyStatusChanged();
        }
        return;
      }
      if (dirty !== '1') return;
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
    invalidatePendingCache();
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
