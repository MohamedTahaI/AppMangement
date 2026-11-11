import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase, subscribeToDirty } from '@/db/schema';
import { getSetting } from '@/db/settings';
import { getReportData } from './reportData';
import { REPORT_TABLE_NAMES, SHEET_SCHEMA_VERSION } from './reportTables';
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
  tabsMissing: string[];
  needsFull: boolean;
}

/**
 * A failure whose Arabic wording was already built on purpose, so the UI can
 * show it as-is (it may contain technical hints such as /exec) together with
 * `details` for the collapsible تفاصيل row.
 */
export class SheetError extends Error {
  details: string | null;
  safeMessage = true;

  constructor(message: string, details: string | null = null) {
    super(message);
    this.details = details;
  }
}

class SyncServerError extends Error {
  code: string;
  status: number | null;
  details: string | null;

  constructor(
    message: string,
    code = 'server_error',
    status: number | null = null,
    details: string | null = null,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function sheetErrorDetails(error: unknown): string | null {
  if (error instanceof SheetError) return error.details;
  if (error instanceof SyncServerError) return error.details;
  if (error instanceof Error && error.message) return error.message;
  return null;
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

function isArabicOnly(message: string): boolean {
  return /[؀-ۿ]/u.test(message) && !/[A-Za-z]/u.test(message);
}

function httpErrorMessage(status: number | null): string {
  if (status === 401 || status === 403) {
    return 'تم رفض الوصول إلى الجدول. تحقق من أن «من لديه حق الوصول» في نشر السكربت «أي شخص» ثم أعد نشر إصدار جديد.';
  }
  if (status === 404) {
    return 'رابط الجدول غير صحيح أو أن عملية النشر لم تعد متاحة. أعد نشر إصدار جديد وانسخ الرابط المنتهي بـ /exec.';
  }
  if (status === null) return 'تعذر الاتصال بالجدول. تحقق من الإنترنت والرابط والرمز.';
  return `تعذر الوصول إلى الجدول (رمز ${status}). أعد نشر السكربت ثم حاول مرة أخرى.`;
}

function shortArabicError(error: unknown): string {
  if (error instanceof SheetError) return error.message;
  const message = error instanceof Error ? error.message : '';

  if (error instanceof SyncServerError) {
    if (error.code === 'bad_secret') return 'رمز الاتصال غير صحيح.';
    if (error.code === 'bad_action') {
      return 'السكربت المنشور قديم. حدث الكود من محرر السكريبت ثم أعد نشر إصدار جديد.';
    }
    if (error.code === 'invalid_response') {
      return 'استجابة غير متوقعة من جوجل. أعد نشر السكربت ثم حاول مرة أخرى.';
    }
    if (error.code === 'http_error') return httpErrorMessage(error.status);
    if (error.code === 'busy') return 'الجدول مشغول، حاول مرة أخرى.';
    if (isArabicOnly(message)) return message;
    if (message.startsWith('تعذر')) return message;
    return 'تعذر الاتصال بالجدول. تحقق من الإنترنت والرابط والرمز.';
  }

  if (/timeout|aborted|network|failed to fetch/i.test(message)) {
    return 'انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مرة أخرى.';
  }
  if (/secret|رمز الاتصال/i.test(message)) return 'رمز الاتصال غير صحيح.';
  if (isArabicOnly(message) || message.startsWith('تعذر')) return message;
  return 'تعذر الاتصال بالجدول. تحقق من الإنترنت والرابط والرمز.';
}

function pingFailure(error: unknown): SheetError {
  if (error instanceof SheetError) return error;
  const details = sheetErrorDetails(error);

  if (error instanceof SyncServerError) {
    if (error.code === 'bad_secret') return new SheetError('الرمز السري غير مطابق.', details);
    if (error.code === 'bad_action') {
      return new SheetError('السكربت المنشور قديم. حدث الكود من محرر السكريبت ثم أعد نشر إصدار جديد.', details);
    }
    if (error.code === 'invalid_response') {
      return new SheetError('استجابة غير متوقعة من جوجل. أعد نشر السكربت ثم حاول مرة أخرى.', details);
    }
    if (error.code === 'http_error') {
      if (error.status === 401 || error.status === 403) {
        return new SheetError('الرابط غير صحيح. تأكد أنه ينتهي بـ /exec وأن الوصول (أي شخص).', details);
      }
      if (error.status === 404) {
        return new SheetError('الرابط غير صحيح. تأكد أنه ينتهي بـ /exec وأن عملية النشر فعّالة.', details);
      }
      return new SheetError(
        `تعذر الوصول إلى الجدول (رمز ${error.status ?? '?'}). أعد نشر السكربت ثم حاول مرة أخرى.`,
        details,
      );
    }
    return new SheetError(isArabicOnly(error.message) ? error.message : 'تعذر الاتصال بالجدول.', details);
  }

  const message = error instanceof Error ? error.message : '';
  if (/timeout|aborted|network|failed to fetch/i.test(message)) {
    return new SheetError('انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مرة أخرى.', details);
  }
  if (/secret|رمز الاتصال/i.test(message)) return new SheetError('الرمز السري غير مطابق.', details);
  if (message) return new SheetError(message, details);
  return new SheetError('تعذر الاتصال بالجدول. تحقق من الإنترنت والرابط والرمز.', details);
}

export function pingMessage(ping: PingResult): string {
  if (ping.tabsMissing.length > 0) {
    return `الاتصال سليم. ناقص ${ping.tabsMissing.length} من أوراق الجدول، وسيُبنى الجدول من جديد عند أول تحديث.`;
  }
  if (ping.needsFull) return 'الاتصال سليم. الجدول سيُبنى من جديد عند أول تحديث.';
  if (ping.revision) return `الاتصال سليم. الجدول محدّث (نسخة ${ping.revision}).`;
  return 'الاتصال سليم. الجدول جاهز.';
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

function responseDetails(status: number | null, body: string): string {
  const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 300);
  const head = status === null ? 'استجابة غير متوقعة' : `HTTP ${status}`;
  return snippet ? `${head} — ${snippet}` : head;
}

async function postRequest(
  action: 'ping' | 'sync',
  data?: SheetSyncPayload,
): Promise<Record<string, unknown>> {
  const url = (await getSetting('sheet_url'))?.trim() ?? '';
  const secret = (await getSetting('sheet_secret')) ?? '';
  if (!url || !secret) throw new SheetError('أدخل رابط الجدول والرمز السري أولاً.');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/i.test(url)) {
    throw new SheetError(
      'رابط الجدول غير صحيح. يجب أن ينتهي بامتداد تطبيق الويب.',
      'الرابط يجب أن يبدأ بـ https://script.google.com/macros/s/ وينتهي بـ /exec، وأن يكون «من لديه حق الوصول» = أي شخص.',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(
        action === 'ping'
          ? { secret, action, expectedTabs: Object.values(REPORT_TABLE_NAMES) }
          : { secret, action, data },
      ),
      signal: controller.signal,
    });
    const status = typeof response.status === 'number' ? response.status : null;
    const text = await response.text();
    if (!response.ok) {
      if (__DEV__) console.error('استجابة الجدول غير ناجحة', status, text.slice(0, 300));
      throw new SyncServerError(
        `تعذر الاتصال بالجدول (HTTP ${status ?? '?'}).`,
        'http_error',
        status,
        responseDetails(status, text),
      );
    }
    let result: { ok?: boolean; error?: string; code?: string };
    try {
      result = JSON.parse(text) as { ok?: boolean; error?: string; code?: string };
    } catch {
      if (__DEV__) console.error('استجابة الجدول ليست JSON', status, text.slice(0, 300));
      throw new SyncServerError(
        'استجابة الجدول غير صحيحة. تأكد من نشر السكربت الجديد.',
        'invalid_response',
        status,
        responseDetails(status, text),
      );
    }
    if (!result || typeof result !== 'object' || result.ok !== true) {
      const message = typeof result?.error === 'string' && result.error
        ? result.error
        : 'تعذر تحديث الجدول.';
      const code = typeof result?.code === 'string' && result.code ? result.code : 'server_error';
      throw new SyncServerError(message, code, status, responseDetails(status, text));
    }
    return result as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function pingSheet(): Promise<PingResult> {
  let result: Record<string, unknown>;
  try {
    result = await postRequest('ping');
  } catch (error) {
    throw pingFailure(error);
  }
  const schemaVersion = typeof result.schemaVersion === 'number' ? result.schemaVersion : null;
  const revision = typeof result.revision === 'string' ? result.revision : '';
  const rowCounts = result.rowCounts && typeof result.rowCounts === 'object'
    ? result.rowCounts as Record<string, number>
    : {};
  const tabsMissing = Array.isArray(result.tabsMissing)
    ? result.tabsMissing.filter((name): name is string => typeof name === 'string')
    : [];
  const needsFull = typeof result.needsFull === 'boolean'
    ? result.needsFull
    : !revision || schemaVersion !== SHEET_SCHEMA_VERSION || tabsMissing.length > 0;
  return { revision, schemaVersion, rowCounts, tabsMissing, needsFull };
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
    const details = sheetErrorDetails(error);
    if (isNetworkError(error)) {
      invalidatePendingCache();
      notifyStatusChanged();
      throw new SheetError(message, details);
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
    throw new SheetError(message, details);
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
