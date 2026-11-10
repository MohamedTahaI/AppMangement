import * as XLSX from 'xlsx-js-style';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import type { ReportData } from './reportData';
import { buildReportTables, type ReportTable } from './reportTables';

const HEADER_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'D9EAF7' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
};

const TOTAL_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'EEF6FB' } },
};

function totalRow(table: ReportTable): (string | number)[] | null {
  if (table.totalColumns.length === 0 || table.rows.length === 0) return null;
  return table.headers.map((_, column) => {
    if (column === 0) return 'الإجمالي';
    if (!table.totalColumns.includes(column)) return '';
    return table.rows.reduce((sum, tableRow) => {
      const value = tableRow.values[column];
      return sum + (typeof value === 'number' ? value : 0);
    }, 0);
  });
}

function columnWidths(table: ReportTable): { wch: number }[] {
  return table.headers.map((header, column) => {
    const maxLength = table.rows.reduce((max, tableRow) => {
      const value = tableRow.values[column];
      return Math.max(max, String(value ?? '').length);
    }, header.length);
    return { wch: Math.min(45, Math.max(12, Math.ceil(maxLength * 1.4 + 4))) };
  });
}

function addTableSheet(workbook: XLSX.WorkBook, table: ReportTable): void {
  const values = table.rows.map((tableRow) => tableRow.values);
  const totals = totalRow(table);
  const sheet = XLSX.utils.aoa_to_sheet([table.headers, ...values, ...(totals ? [totals] : [])]);
  const dataEndRow = table.rows.length;
  const lastRow = totals ? dataEndRow + 1 : dataEndRow;

  for (let column = 0; column < table.headers.length; column += 1) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (headerCell) headerCell.s = HEADER_STYLE;
    for (let rowIndex = 1; rowIndex <= lastRow; rowIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: column });
      const cell = sheet[address];
      if (!cell) continue;
      if (cell.t === 'n' && table.moneyColumns.includes(column)) cell.z = '#,##0';
      if (totals && rowIndex === lastRow) cell.s = TOTAL_STYLE;
      if (rowIndex <= dataEndRow) {
        const fill = table.rows[rowIndex - 1]?.fills?.[column];
        if (fill) {
          cell.s = {
            ...(cell.s ?? {}),
            fill: { patternType: 'solid', fgColor: { rgb: fill } },
          };
        }
      }
    }
  }

  sheet['!views'] = [{ rightToLeft: true }];
  sheet['!cols'] = columnWidths(table);
  if (table.hasFilter && dataEndRow > 0) {
    sheet['!autofilter'] = {
      ref: `A1:${XLSX.utils.encode_col(table.headers.length - 1)}${dataEndRow + 1}`,
    };
  }
  (sheet as XLSX.WorkSheet & { '!freeze'?: object })['!freeze'] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: 'A2',
    activePane: 'bottomLeft',
    state: 'frozen',
  };
  XLSX.utils.book_append_sheet(workbook, sheet, table.name);
}

export function buildReportWorkbook(report: ReportData): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  for (const table of buildReportTables(report)) addTableSheet(workbook, table);
  return workbook;
}

export function writeReportWorkbook(report: ReportData): Uint8Array {
  const workbook = buildReportWorkbook(report);
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const files = unzipSync(new Uint8Array(output));

  for (const path of Object.keys(files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue;
    const xml = strFromU8(files[path]);
    let updated = false;
    const sheetXml = xml.replace(/<sheetView\b([^>]*?)(?:\/>|>([\s\S]*?)<\/sheetView>)/, (_match, rawAttributes: string) => {
      updated = true;
      const attributes = rawAttributes.replace(/\s+rightToLeft="[^"]*"/, '');
      return `<sheetView${attributes} rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>`;
    });
    if (!updated) throw new Error('تعذر تجهيز اتجاه وتجميد عناوين ملف Excel.');
    files[path] = strToU8(sheetXml);
  }

  return zipSync(files, { level: 6 });
}
