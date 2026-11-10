const SECRET = 'CHANGE_ME';

var SCHEMA_VERSION = 3;
var KEY_HEADER = '__key__';
var TOTAL_KEY = 'TOTAL';

var OLD_TAB_NAMES = [
  'ملخص',
  'ملخص كل شهر',
  'حالة الشقق',
  'التحصيلات الخاصة',
  'المصروفات',
  'سجل المدفوعات',
  'الشقق',
  'تعديل الرصيد',
];

var COLORS = {
  header: '#D9EAF7',
  total: '#EEF6FB',
};

/**
 * Expected POST JSON (v3):
 * {
 *   "secret": "the same secret configured in the app",
 *   "action": "ping" | "sync",
 *   "data": {
 *     "schemaVersion": 3,
 *     "revision": "client revision",
 *     "baseRevision": "last revision stored on the phone",
 *     "full": false,
 *     "generatedAt": "2026-11-09T12:00:00.000Z",
 *     "buildingName": "Building name",
 *     "tabs": [
 *       {
 *         "key": "payments",
 *         "name": "الدفعات",
 *         "headers": ["التاريخ", "..."],
 *         "keys": ["pay:1"],
 *         "rows": [["2026-11-09", "..."]],
 *         "deletedKeys": [],
 *         "hasFilter": true,
 *         "moneyColumns": [5],
 *         "totalColumns": [5]
 *       }
 *     ]
 *   }
 * }
 *
 * The first column is a hidden key column. Do not edit or delete it.
 */

function doPost(e) {
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') {
      throw fail_('bad_request', 'بيانات الطلب غير موجودة.');
    }
    var request = JSON.parse(e.postData.contents);
    if (!request || request.secret !== SECRET) {
      throw fail_('bad_secret', 'رمز الاتصال غير صحيح.');
    }
    if (request.action === 'ping') {
      return jsonResponse_(ping_());
    }
    if (request.action !== 'sync') {
      throw fail_('bad_action', 'نوع الطلب غير مدعوم.');
    }

    validatePayload_(request.data);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) {
      throw fail_('busy', 'الجدول مشغول، حاول مرة أخرى.');
    }
    try {
      var result = writePayload_(request.data);
      return jsonResponse_({
        ok: true,
        revision: result.revision,
        schemaVersion: result.schemaVersion,
        rowCounts: result.rowCounts,
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonResponse_({
      ok: false,
      code: error && error.code ? String(error.code) : 'server_error',
      error: error && error.message ? String(error.message) : 'تعذر تحديث الجدول.',
    });
  }
}

function ping_() {
  var properties = PropertiesService.getScriptProperties();
  var schemaVersion = Number(properties.getProperty('schemaVersion')) || 0;
  var revision = properties.getProperty('revision') || '';
  var rowCounts = {};
  try {
    rowCounts = JSON.parse(properties.getProperty('rowCounts') || '{}');
  } catch (error) {
    rowCounts = {};
  }
  return {
    ok: true,
    schemaVersion: schemaVersion,
    revision: revision,
    rowCounts: rowCounts,
  };
}

function writePayload_(data) {
  var properties = PropertiesService.getScriptProperties();
  var storedSchema = Number(properties.getProperty('schemaVersion')) || 0;
  var storedRevision = properties.getProperty('revision') || '';
  var full = Boolean(data.full);

  if (!full) {
    if (storedSchema !== SCHEMA_VERSION) {
      throw fail_('schema_mismatch', 'نسخة الجدول قديمة. ستتم إعادة بنائه بالكامل.');
    }
    if (!storedRevision || data.baseRevision !== storedRevision) {
      throw fail_('revision_mismatch', 'الجدول تغير من جهاز آخر. ستتم إعادة بناء البيانات المرسلة.');
    }
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var rowCounts = {};

  data.tabs.forEach(function (tab) {
    var sheet = full
      ? ensureSheet_(spreadsheet, tab.name)
      : requiredSheet_(spreadsheet, tab.name);
    if (full) {
      resetSheet_(sheet, tab);
    } else {
      ensureHeader_(sheet, tab);
    }
    rowCounts[tab.key] = mergeTab_(sheet, tab);
  });

  if (full) cleanupOldTabs_(spreadsheet, data.tabs);

  properties.setProperties({
    revision: data.revision,
    schemaVersion: String(SCHEMA_VERSION),
    rowCounts: JSON.stringify(rowCounts),
    updatedAt: new Date().toISOString(),
  });

  return {
    revision: data.revision,
    schemaVersion: SCHEMA_VERSION,
    rowCounts: rowCounts,
  };
}

function validatePayload_(data) {
  if (!data || typeof data !== 'object') {
    throw fail_('bad_request', 'بيانات الجدول غير موجودة.');
  }
  if (Number(data.schemaVersion) !== SCHEMA_VERSION) {
    throw fail_('schema_mismatch', 'نسخة البيانات غير متوافقة مع السكربت.');
  }
  if (typeof data.revision !== 'string' || !data.revision) {
    throw fail_('bad_request', 'رقم مراجعة البيانات غير صالح.');
  }
  if (typeof data.baseRevision !== 'string') {
    throw fail_('bad_request', 'رقم مراجعة الأساس غير صالح.');
  }
  if (!Array.isArray(data.tabs) || data.tabs.length === 0) {
    throw fail_('bad_request', 'قائمة الجداول غير صالحة.');
  }

  var seenTabs = {};
  data.tabs.forEach(function (tab) {
    if (!tab || typeof tab.key !== 'string' || typeof tab.name !== 'string') {
      throw fail_('bad_request', 'بيانات أحد الجداول غير صالحة.');
    }
    if (seenTabs[tab.key]) {
      throw fail_('bad_request', 'تكرار في مفاتيح الجداول.');
    }
    seenTabs[tab.key] = true;
    if (!Array.isArray(tab.headers) || !Array.isArray(tab.keys) || !Array.isArray(tab.rows)) {
      throw fail_('bad_request', 'هيكل الجدول غير صالح: ' + tab.key);
    }
    if (tab.keys.length !== tab.rows.length) {
      throw fail_('bad_request', 'عدد الصفوف لا يطابق المفاتيح: ' + tab.key);
    }
    if (tab.deletedKeys !== undefined && !Array.isArray(tab.deletedKeys)) {
      throw fail_('bad_request', 'قائمة المحذوفات غير صالحة: ' + tab.key);
    }
    if (tab.fills !== undefined) {
      if (!Array.isArray(tab.fills) || tab.fills.length !== tab.rows.length) {
        throw fail_('bad_request', 'ألوان الصفوف غير صالحة: ' + tab.key);
      }
      tab.fills.forEach(function (rowFills) {
        if (!Array.isArray(rowFills) || rowFills.length !== tab.headers.length) {
          throw fail_('bad_request', 'عدد ألوان الصف لا يطابق الأعمدة: ' + tab.key);
        }
        rowFills.forEach(function (fill) {
          if (fill !== null && !/^[0-9A-Fa-f]{6}$/.test(String(fill))) {
            throw fail_('bad_request', 'قيمة لون غير صالحة: ' + tab.key);
          }
        });
      });
    }
    var seenRows = {};
    tab.rows.forEach(function (row, index) {
      if (!Array.isArray(row) || row.length !== tab.headers.length) {
        throw fail_('bad_request', 'أحد صفوف الجدول غير مكتمل: ' + tab.key);
      }
      var key = String(tab.keys[index]);
      if (seenRows[key]) {
        throw fail_('bad_request', 'تكرار في مفاتيح الصفوف: ' + tab.key);
      }
      seenRows[key] = true;
    });
  });
}

function requiredSheet_(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    throw fail_('sheet_damaged', 'ورقة مفقودة: ' + name);
  }
  return sheet;
}

function ensureSheet_(spreadsheet, name) {
  var existing = spreadsheet.getSheetByName(name);
  if (existing) return existing;
  var firstSheet = spreadsheet.getSheets()[0];
  if (
    firstSheet &&
    firstSheet.getName() === 'Sheet1' &&
    firstSheet.getLastRow() === 0 &&
    firstSheet.getLastColumn() === 0
  ) {
    firstSheet.setName(name);
    return firstSheet;
  }
  return spreadsheet.insertSheet(name);
}

function cleanupOldTabs_(spreadsheet, tabs) {
  var keep = {};
  tabs.forEach(function (tab) {
    keep[tab.name] = true;
  });
  spreadsheet.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (keep[name]) return;
    var old = OLD_TAB_NAMES.indexOf(name) !== -1;
    var oldMonthly = /^الفاتورة الشهرية \d{4}$/.test(name);
    if ((old || oldMonthly) && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(sheet);
    }
  });
}

function resetSheet_(sheet, tab) {
  var filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.getMergedRanges().forEach(function (range) {
    range.breakApart();
  });
  sheet.clear();
  sheet.setRightToLeft(true);
  sheet.setFrozenRows(1);

  var headers = [KEY_HEADER].concat(tab.headers);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers.map(safeCell_)]);
  headerRange.setFontWeight('bold').setBackground(COLORS.header).setWrap(true);
  sheet.setColumnWidth(1, 36);
  sheet.hideColumns(1);
}

function ensureHeader_(sheet, tab) {
  var expected = [KEY_HEADER].concat(tab.headers);
  var current = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  if (current.map(String).join('\u0001') !== expected.map(String).join('\u0001')) {
    throw fail_('sheet_damaged', 'رأس الجدول تغير: ' + tab.name);
  }
  sheet.setRightToLeft(true);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 36);
  sheet.hideColumns(1);
}

function mergeTab_(sheet, tab) {
  var columnCount = tab.headers.length + 1;
  var lastRow = sheet.getLastRow();
  var existingRows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, columnCount).getValues() : [];
  var rowsByKey = new Map();
  var fillsByKey = {};
  if (tab.fills) {
    tab.keys.forEach(function (key, index) {
      fillsByKey[String(key)] = tab.fills[index];
    });
  }

  existingRows.forEach(function (row) {
    var key = String(row[0]);
    if (!key || key === TOTAL_KEY) return;
    rowsByKey.set(key, row.slice(1));
  });

  tab.keys.forEach(function (key, index) {
    rowsByKey.set(String(key), tab.rows[index]);
  });
  (tab.deletedKeys || []).forEach(function (key) {
    rowsByKey.delete(String(key));
  });

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), columnCount)).clearContent();
  }

  var entries = Array.from(rowsByKey.entries());
  if (entries.length > 0) {
    var values = entries.map(function (entry) {
      var row = entry[1].slice(0, tab.headers.length);
      while (row.length < tab.headers.length) row.push('');
      return [entry[0]].concat(row.map(safeCell_));
    });
    sheet.getRange(2, 1, values.length, columnCount).setValues(values);
  }

  if (lastRow > entries.length + 1) {
    sheet
      .getRange(entries.length + 2, 1, lastRow - entries.length - 1, Math.max(sheet.getLastColumn(), columnCount))
      .clearFormat();
  }

  formatTab_(sheet, tab, entries);
  applyFills_(sheet, tab, entries, fillsByKey);

  var filter = sheet.getFilter();
  if (tab.hasFilter && entries.length > 0) {
    if (filter) filter.remove();
    sheet.getRange(1, 1, entries.length + 1, columnCount).createFilter();
  } else if (filter) {
    filter.remove();
  }

  writeTotals_(sheet, tab, entries);
  return entries.length;
}

function formatTab_(sheet, tab, entries) {
  var columnCount = tab.headers.length + 1;
  var headerRange = sheet.getRange(1, 1, 1, columnCount);
  headerRange.setFontWeight('bold').setBackground(COLORS.header).setWrap(true);

  tab.headers.forEach(function (header, index) {
    var width = 90;
    var maxChars = String(header).length;
    entries.forEach(function (entry) {
      maxChars = Math.max(maxChars, String(entry[1][index] === undefined ? '' : entry[1][index]).length);
    });
    width = Math.max(90, Math.min(260, maxChars * 8 + 24));
    sheet.setColumnWidth(index + 2, width);
    if (header === 'التاريخ' && entries.length > 0) {
      sheet.getRange(2, index + 2, entries.length, 1).setNumberFormat('yyyy-mm-dd');
    }
  });

  (tab.moneyColumns || []).forEach(function (index) {
    if (entries.length > 0) {
      sheet.getRange(2, index + 2, entries.length, 1).setNumberFormat('#,##0');
    }
  });
}

function applyFills_(sheet, tab, entries, fillsByKey) {
  entries.forEach(function (entry, rowIndex) {
    var fills = fillsByKey[String(entry[0])];
    if (!fills) return;
    for (var column = 0; column < fills.length; column += 1) {
      var fill = fills[column];
      sheet
        .getRange(rowIndex + 2, column + 2, 1, 1)
        .setBackground(fill ? '#' + String(fill).replace(/^#/, '') : null);
    }
  });
}

function writeTotals_(sheet, tab, entries) {
  var totals = tab.totalColumns || [];
  if (totals.length === 0) return;
  var columns = tab.headers.length + 1;
  var row = new Array(columns).fill('');
  row[0] = TOTAL_KEY;
  if (tab.headers.length > 0) row[1] = 'الإجمالي';
  totals.forEach(function (index) {
    var sum = 0;
    entries.forEach(function (entry) {
      var value = Number(entry[1][index]);
      if (isFinite(value)) sum += value;
    });
    row[index + 1] = sum;
  });
  var totalsRow = entries.length + 2;
  var range = sheet.getRange(totalsRow, 1, 1, columns);
  range.setValues([row.map(safeCell_)]);
  range.setFontWeight('bold').setBackground(COLORS.total);
  totals.forEach(function (index) {
    sheet.getRange(totalsRow, index + 2, 1, 1).setNumberFormat('#,##0');
  });
}

function safeCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function sampleTab_(key, name, headers, rows, moneyColumns, totalColumns, hasFilter) {
  return {
    key: key,
    name: name,
    headers: headers,
    keys: rows.map(function (_, index) { return 'sample:' + key + ':' + index; }),
    rows: rows,
    deletedKeys: [],
    hasFilter: Boolean(hasFilter),
    moneyColumns: moneyColumns || [],
    totalColumns: totalColumns || [],
  };
}

function testWithSampleData() {
  var tabs = [
    sampleTab_('summary', 'الملخص', ['البيان', 'القيمة'], [
      ['اسم العمارة', 'عمارة النخيل'],
      ['إجمالي التحصيل', 2400],
      ['إجمالي المصروفات', 650],
      ['الرصيد', 1750],
    ], [1]),
    sampleTab_('apartmentStatus', 'حالة الشقق', ['رقم الشقة', 'اسم المالك', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة', 'الشهور المدفوعة'], [
      ['1', 'أحمد', 400, 400, 0, 'مدفوع', '2026-10'],
      ['2', 'سارة', 400, 0, 400, 'لم يدفع', ''],
    ], [2, 3, 4], [2, 3, 4], true),
    sampleTab_('months', 'جدول الأشهر', ['السنة', 'رقم الشقة', 'اسم المالك', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', 'إجمالي المدفوع', 'إجمالي المتبقي'], [
      [2026, '1', 'أحمد', 400, 400, 400, 400, 400, 400, 400, 400, 400, 400, 200, 0, 4400, 200],
    ], [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    sampleTab_('payments', 'الدفعات', ['التاريخ', 'رقم الشقة', 'اسم المالك', 'النوع', 'الشهر أو التحصيل', 'المبلغ', 'ملاحظة'], [
      ['2026-11-03', '1', 'أحمد', 'اشتراك شهري', '2026-11', 200, ''],
    ], [5], [5], true),
    sampleTab_('specials', 'التحصيلات الخاصة', ['اسم التحصيل', 'التاريخ', 'المبلغ لكل شقة', 'عدد الشقق', 'المطلوب', 'المدفوع', 'المتبقي'], [
      ['صيانة المصعد', '2026-11-01', 500, 2, 1000, 750, 250],
    ], [2, 4, 5, 6], [4, 5, 6]),
    sampleTab_('specialDetails', 'تفاصيل التحصيلات الخاصة', ['اسم التحصيل', 'التاريخ', 'المبلغ لكل شقة', 'رقم الشقة', 'اسم المالك', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة'], [
      ['صيانة المصعد', '2026-11-01', 500, '1', 'أحمد', 500, 500, 0, 'مدفوع'],
      ['صيانة المصعد', '2026-11-01', 500, '2', 'سارة', 500, 250, 250, 'جزئي'],
    ], [2, 5, 6, 7], [5, 6, 7], true),
    sampleTab_('expenses', 'المصروفات', ['التاريخ', 'النوع', 'المبلغ', 'ملاحظة', 'التحصيل المرتبط'], [
      ['2026-11-05', 'صيانة', 400, 'إصلاح المصعد', 'صيانة المصعد'],
    ], [2], [2], true),
    sampleTab_('expensesByCategory', 'المصروفات حسب النوع', ['نوع المصروف', 'الإجمالي'], [
      ['صيانة', 400],
      ['الكهرباء', 250],
    ], [1], [1]),
    sampleTab_('adjustments', 'التعديلات', ['التاريخ', 'النوع', 'المبلغ', 'السبب', 'الحالة', 'سبب الإلغاء'], [
      ['2026-11-02', 'زيادة', 200, 'تصحيح رصيد سابق', 'سارية', ''],
    ], [2]),
    sampleTab_('unpaid', 'المتأخرين', ['رقم الشقة', 'اسم المالك', 'الشهور غير المدفوعة', 'إجمالي المتبقي'], [
      ['2', 'سارة', '2026-11', 400],
    ], [3], [3]),
    sampleTab_('monthlySummary', 'ملخص كل شهر', ['الشهر', 'التحصيل', 'المصروفات', 'الصافي'], [
      ['2026-10', 1200, 250, 950],
      ['2026-11', 1200, 400, 800],
    ], [1, 2, 3], [1, 2, 3]),
  ];

  writePayload_({
    schemaVersion: SCHEMA_VERSION,
    revision: 'sample-' + Date.now(),
    baseRevision: '',
    full: true,
    generatedAt: new Date().toISOString(),
    buildingName: 'عمارة النخيل',
    tabs: tabs,
  });
}
