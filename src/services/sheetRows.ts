import type { ReportData } from './reportData';
import {
  SHEET_SCHEMA_VERSION,
  buildReportTables,
  hashRow,
  tablesRevision,
  type ReportCell,
  type ReportTable,
} from './reportTables';

export interface SheetTab {
  key: string;
  name: string;
  headers: string[];
  rows: { key: string; values: ReportCell[]; hash: string; fills?: (string | null)[] }[];
  hasFilter: boolean;
  moneyColumns: number[];
  totalColumns: number[];
}

export interface SheetSnapshot {
  schemaVersion: number;
  revision: string;
  generatedAt: string;
  buildingName: string;
  tabs: SheetTab[];
}

export type SyncState = Map<string, Map<string, string>>;

export interface SheetSyncTabPayload {
  key: string;
  name: string;
  headers: string[];
  keys: string[];
  rows: ReportCell[][];
  fills?: (string | null)[][];
  deletedKeys: string[];
  hasFilter: boolean;
  moneyColumns: number[];
  totalColumns: number[];
}

export interface SheetSyncPayload {
  schemaVersion: number;
  revision: string;
  baseRevision: string;
  full: boolean;
  generatedAt: string;
  buildingName: string;
  tabs: SheetSyncTabPayload[];
}

export interface PendingChanges {
  count: number;
  tabs: { tabKey: string; rowKey: string; hash: string }[];
  deleted: { tabKey: string; rowKey: string }[];
}

function serialize(table: ReportTable): SheetTab {
  return {
    key: table.key,
    name: table.name,
    headers: table.headers,
    hasFilter: table.hasFilter,
    moneyColumns: table.moneyColumns,
    totalColumns: table.totalColumns,
    rows: table.rows.map((tableRow) => ({
      key: tableRow.key,
      values: tableRow.values,
      hash: hashRow(
        tableRow.fills
          ? tableRow.values.concat(tableRow.fills.map((fill) => fill ?? ''))
          : tableRow.values,
      ),
      ...(tableRow.fills ? { fills: tableRow.fills } : {}),
    })),
  };
}

export function buildSheetSnapshot(report: ReportData): SheetSnapshot {
  const currentYear = new Date().getFullYear();
  const tables = buildReportTables(report).map((table) =>
    table.key === 'months'
      ? {
          ...table,
          rows: table.rows.filter((tableRow) => Number(tableRow.values[0]) === currentYear),
        }
      : table,
  );
  return {
    schemaVersion: SHEET_SCHEMA_VERSION,
    revision: tablesRevision(tables),
    generatedAt: report.generatedAt,
    buildingName: report.buildingName,
    tabs: tables.map(serialize),
  };
}

export function sheetRowCounts(snapshot: SheetSnapshot): Record<string, number> {
  return Object.fromEntries(snapshot.tabs.map((tab) => [tab.key, tab.rows.length]));
}

export function findPendingChanges(snapshot: SheetSnapshot, state: SyncState): PendingChanges {
  const changes: PendingChanges = { count: 0, tabs: [], deleted: [] };
  const currentTabKeys = new Set(snapshot.tabs.map((tab) => tab.key));
  for (const tab of snapshot.tabs) {
    const stored = state.get(tab.key);
    for (const tableRow of tab.rows) {
      if (!stored || stored.get(tableRow.key) !== tableRow.hash) {
        changes.count += 1;
        changes.tabs.push({ tabKey: tab.key, rowKey: tableRow.key, hash: tableRow.hash });
      }
    }
    if (stored) {
      for (const rowKey of stored.keys()) {
        if (!tab.rows.some((tableRow) => tableRow.key === rowKey)) {
          changes.count += 1;
          changes.deleted.push({ tabKey: tab.key, rowKey });
        }
      }
    }
  }
  for (const [tabKey, stored] of state) {
    if (currentTabKeys.has(tabKey)) continue;
    for (const rowKey of stored.keys()) {
      changes.count += 1;
      changes.deleted.push({ tabKey, rowKey });
    }
  }
  return changes;
}

export function buildSheetSyncPayload(
  snapshot: SheetSnapshot,
  state: SyncState,
  baseRevision: string,
  full: boolean,
): SheetSyncPayload {
  const pending = findPendingChanges(snapshot, state);
  const changedByTab = new Set(pending.tabs.map((change) => change.tabKey));
  const deletedByTab = new Set(pending.deleted.map((change) => change.tabKey));

  return {
    schemaVersion: snapshot.schemaVersion,
    revision: snapshot.revision,
    baseRevision,
    full,
    generatedAt: snapshot.generatedAt,
    buildingName: snapshot.buildingName,
    tabs: snapshot.tabs.map((tab) => {
      const includeAll = full || !state.has(tab.key);
      const rows = includeAll
        ? tab.rows
        : changedByTab.has(tab.key)
          ? tab.rows.filter((tableRow) => state.get(tab.key)?.get(tableRow.key) !== tableRow.hash)
          : [];
      const deletedKeys = includeAll
        ? []
        : deletedByTab.has(tab.key)
          ? pending.deleted.filter((change) => change.tabKey === tab.key).map((change) => change.rowKey)
          : [];
      const fills = rows.some((tableRow) => tableRow.fills)
        ? rows.map((tableRow) => tableRow.fills ?? tab.headers.map(() => null))
        : undefined;
      return {
        key: tab.key,
        name: tab.name,
        headers: tab.headers,
        keys: rows.map((tableRow) => tableRow.key),
        rows: rows.map((tableRow) => tableRow.values),
        ...(fills ? { fills } : {}),
        deletedKeys,
        hasFilter: tab.hasFilter,
        moneyColumns: tab.moneyColumns,
        totalColumns: tab.totalColumns,
      };
    }),
  };
}

export function snapshotSyncState(snapshot: SheetSnapshot): { tabKey: string; rowKey: string; hash: string }[] {
  return snapshot.tabs.flatMap((tab) =>
    tab.rows.map((tableRow) => ({ tabKey: tab.key, rowKey: tableRow.key, hash: tableRow.hash })),
  );
}
