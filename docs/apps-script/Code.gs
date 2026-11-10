const SECRET = 'CHANGE_ME';

/**
 * Expected POST JSON:
 * {
 *   "secret": "the same secret configured in the app",
 *   "action": "ping" | "sync",
 *   "data": {
 *     "summary": {
 *       "buildingName": "Building name",
 *       "generatedAt": "2026-11-09T12:00:00.000Z",
 *       "collectedFromPayments": 1200,
 *       "netAdjustments": 200,
 *       "totalCollected": 1400,
 *       "totalExpenses": 300,
 *       "balance": 900
 *     },
 *     "monthlySummary": [
 *       { "month": "2026-11", "collected": 800, "expenses": 200 }
 *     ],
 *     "monthlyMatrix": [
 *       {
 *         "year": 2026,
 *         "apartments": [
 *           {
 *             "number": "1",
 *             "ownerName": "Owner",
 *             "months": {
 *               "01": { "paid": 400, "due": 400, "status": "مدفوع" },
 *               "02": { "paid": 200, "due": 400, "status": "جزئي" },
 *               "03": { "paid": 0, "due": 400, "status": "لم يدفع" }
 *             },
 *             "totalPaid": 600,
 *             "totalRemaining": 600
 *           }
 *         ]
 *       }
 *     ],
 *     "specialCollections": [
 *       {
 *         "id": 7,
 *         "title": "Elevator repair",
 *         "apartments": [
 *           {
 *             "number": "1", "ownerName": "Owner", "due": 500,
 *             "paid": 250, "remaining": 250, "status": "جزئي"
 *           }
 *         ]
 *       }
 *     ],
 *     "expenses": [
 *       {
 *         "date": "2026-11-09", "category": "Maintenance", "amount": 200,
 *         "note": "Note", "linkedCollection": "Elevator repair"
 *       }
 *     ],
 *     "payments": [
 *       {
 *         "date": "2026-11-09", "apartmentNumber": "1", "ownerName": "Owner",
 *         "type": "اشتراك شهري", "monthOrCollection": "2026-11", "amount": 400
 *       }
 *     ],
 *     "apartments": [{ "number": "1", "ownerName": "Owner" }],
 *     "adjustments": [
 *       {
 *         "date": "2026-11-09", "type": "زيادة", "amount": 200,
 *         "reason": "تصحيح رصيد سابق", "status": "سارية", "cancelReason": ""
 *       }
 *     ]
 *   }
 * }
 */

const TAB_NAMES = {
  summary: 'ملخص',
  specialCollections: 'التحصيلات الخاصة',
  expenses: 'المصروفات',
  payments: 'سجل المدفوعات',
  apartments: 'الشقق',
  adjustments: 'التسويات',
};

const COLORS = {
  header: '#D9EAF7',
  paid: '#D9EAD3',
  partial: '#FCE5CD',
  unpaid: '#F4CCCC',
  blank: '#FFFFFF',
};

function doPost(e) {
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') {
      return jsonResponse_({ ok: false, error: 'بيانات الطلب غير موجودة.' });
    }

    const request = JSON.parse(e.postData.contents);
    if (!request || request.secret !== SECRET) {
      return jsonResponse_({ ok: false, error: 'رمز الاتصال غير صحيح.' });
    }
    if (request.action === 'ping') {
      return jsonResponse_({ ok: true });
    }
    if (request.action !== 'sync') {
      return jsonResponse_({ ok: false, error: 'نوع الطلب غير مدعوم.' });
    }

    validateSnapshot_(request.data);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) {
      return jsonResponse_({ ok: false, error: 'الجدول مشغول، حاول مرة أخرى.' });
    }
    try {
      writeSnapshot_(request.data);
    } finally {
      lock.releaseLock();
    }
    return jsonResponse_({ ok: true });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error && error.message ? String(error.message) : 'تعذر تحديث الجدول.',
    });
  }
}

function testWithSampleData() {
  const sample = {
    summary: {
      buildingName: 'عمارة النخيل',
      generatedAt: new Date().toISOString(),
      totalCollected: 2400,
      collectedFromPayments: 2200,
      netAdjustments: 200,
      totalExpenses: 650,
      balance: 1750,
    },
    monthlySummary: [
      { month: '2026-10', collected: 1200, expenses: 250 },
      { month: '2026-11', collected: 1200, expenses: 400 },
    ],
    monthlyMatrix: [
      {
        year: 2026,
        apartments: [
          {
            number: '1',
            ownerName: 'أحمد',
            months: {
              '10': { paid: 400, due: 400, status: 'مدفوع' },
              '11': { paid: 200, due: 400, status: 'جزئي' },
            },
            totalPaid: 600,
            totalRemaining: 200,
          },
          {
            number: '2',
            ownerName: 'سارة',
            months: {
              '10': { paid: 0, due: 400, status: 'لم يدفع' },
            },
            totalPaid: 0,
            totalRemaining: 400,
          },
        ],
      },
    ],
    specialCollections: [
      {
        id: 7,
        title: 'صيانة المصعد',
        apartments: [
          { number: '1', ownerName: 'أحمد', due: 500, paid: 500, remaining: 0, status: 'مدفوع' },
          { number: '2', ownerName: 'سارة', due: 500, paid: 250, remaining: 250, status: 'جزئي' },
        ],
      },
    ],
    expenses: [
      {
        date: '2026-11-05',
        category: 'صيانة',
        amount: 400,
        note: 'إصلاح المصعد',
        linkedCollection: 'صيانة المصعد',
      },
      {
        date: '2026-11-01',
        category: 'الكهرباء',
        amount: 250,
        note: '',
        linkedCollection: '',
      },
    ],
    payments: [
      {
        date: '2026-11-03',
        apartmentNumber: '1',
        ownerName: 'أحمد',
        type: 'اشتراك شهري',
        monthOrCollection: '2026-11',
        amount: 200,
      },
      {
        date: '2026-11-04',
        apartmentNumber: '2',
        ownerName: 'سارة',
        type: 'تحصيل خاص',
        monthOrCollection: 'صيانة المصعد',
        amount: 250,
      },
    ],
    apartments: [
      { number: '1', ownerName: 'أحمد' },
      { number: '2', ownerName: 'سارة' },
    ],
    adjustments: [
      {
        date: '2026-11-02',
        type: 'زيادة',
        amount: 200,
        reason: 'تصحيح رصيد سابق',
        status: 'سارية',
        cancelReason: '',
      },
    ],
  };
  writeSnapshot_(sample);
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function validateSnapshot_(data) {
  const requiredArrays = [
    'monthlySummary',
    'monthlyMatrix',
    'specialCollections',
    'expenses',
    'payments',
    'apartments',
    'adjustments',
  ];
  if (!data || typeof data !== 'object' || !data.summary || typeof data.summary !== 'object') {
    throw new Error('بيانات الملخص غير صالحة.');
  }
  requiredArrays.forEach(function (key) {
    if (!Array.isArray(data[key])) throw new Error('قائمة البيانات غير صالحة: ' + key);
  });
  if (
    typeof data.summary.buildingName !== 'string' ||
    typeof data.summary.generatedAt !== 'string' ||
    !isFinite(Number(data.summary.totalCollected)) ||
    !isFinite(Number(data.summary.totalExpenses)) ||
    !isFinite(Number(data.summary.balance))
  ) {
    throw new Error('قيم الملخص غير مكتملة.');
  }
}

function writeSnapshot_(data) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const monthlyTabNames = data.monthlyMatrix.map(function (entry) {
    return 'الاشتراك الشهري ' + String(entry.year);
  });
  const managedNames = Object.keys(TAB_NAMES).map(function (key) {
    return TAB_NAMES[key];
  }).concat(monthlyTabNames);

  Object.keys(TAB_NAMES).forEach(function (key) {
    ensureSheet_(spreadsheet, TAB_NAMES[key]);
  });
  monthlyTabNames.forEach(function (name) {
    ensureSheet_(spreadsheet, name);
  });
  spreadsheet.getSheets().forEach(function (sheet) {
    if (/^الاشتراك الشهري \d{4}$/.test(sheet.getName()) &&
        managedNames.indexOf(sheet.getName()) === -1) {
      spreadsheet.deleteSheet(sheet);
    }
  });

  writeSummary_(spreadsheet.getSheetByName(TAB_NAMES.summary), data);
  writeSpecialCollections_(spreadsheet.getSheetByName(TAB_NAMES.specialCollections), data);
  writeExpenses_(spreadsheet.getSheetByName(TAB_NAMES.expenses), data);
  writePayments_(spreadsheet.getSheetByName(TAB_NAMES.payments), data);
  writeApartments_(spreadsheet.getSheetByName(TAB_NAMES.apartments), data);
  writeAdjustments_(spreadsheet.getSheetByName(TAB_NAMES.adjustments), data);
  data.monthlyMatrix.forEach(function (yearData) {
    writeMonthlyMatrix_(spreadsheet.getSheetByName('الاشتراك الشهري ' + yearData.year), yearData);
  });
}

function ensureSheet_(spreadsheet, name) {
  const existing = spreadsheet.getSheetByName(name);
  if (existing) return existing;
  const firstSheet = spreadsheet.getSheets()[0];
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

function resetSheet_(sheet, headers, widths) {
  const filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.clear();
  sheet.setRightToLeft(true);
  sheet.setFrozenRows(1);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers.map(safeCell_)]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground(COLORS.header);
  headerRange.setWrap(true);
  headers.forEach(function (_, index) {
    sheet.setColumnWidth(index + 1, widths[index] || 140);
  });
}

function appendRows_(sheet, rows, columnCount) {
  if (rows.length === 0) return;
  const values = rows.map(function (row) {
    const padded = row.slice(0, columnCount);
    while (padded.length < columnCount) padded.push('');
    return padded.map(safeCell_);
  });
  sheet.getRange(2, 1, values.length, columnCount).setValues(values);
}

function safeCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function writeSummary_(sheet, data) {
  resetSheet_(sheet, ['البيان', 'القيمة'], [220, 180]);
  const summary = data.summary;
  const rows = [
    ['اسم العمارة', summary.buildingName],
    ['آخر تحديث', summary.generatedAt],
    ['المحصل من المدفوعات', summary.collectedFromPayments || 0],
    ['صافي التسويات', summary.netAdjustments || 0],
    ['إجمالي التحصيل', summary.totalCollected],
    ['إجمالي المصروفات', summary.totalExpenses],
    ['الرصيد', summary.balance],
    ['', ''],
    ['الشهر', 'التحصيل', 'المصروفات'],
  ];
  const values = rows.concat(data.monthlySummary.map(function (item) {
    return [item.month, item.collected, item.expenses];
  }));
  const safeValues = values.map(function (row) {
    return row.map(safeCell_);
  });
  sheet.getRange(2, 1, safeValues.length, 3).setValues(
    safeValues.map(function (row) {
      while (row.length < 3) row.push('');
      return row;
    }),
  );
  sheet.getRange(10, 1, 1, 3).setFontWeight('bold').setBackground(COLORS.header);
  sheet.setColumnWidth(3, 160);
  sheet.getRange(4, 2, 5, 1).setNumberFormat('#,##0.## "ج"');
  if (data.monthlySummary.length) {
    sheet.getRange(11, 2, data.monthlySummary.length, 2).setNumberFormat('#,##0.## "ج"');
  }
}

function writeMonthlyMatrix_(sheet, yearData) {
  const headers = ['رقم الشقة', 'اسم المالك'];
  for (let month = 1; month <= 12; month += 1) {
    headers.push(('0' + month).slice(-2));
  }
  headers.push('إجمالي المدفوع', 'إجمالي المتبقي');
  resetSheet_(sheet, headers, [110, 180].concat(Array(12).fill(100), [140, 140]));

  const backgrounds = [];
  const rows = yearData.apartments.map(function (apartment) {
    const row = [apartment.number, apartment.ownerName];
    const colors = [COLORS.blank, COLORS.blank];
    for (let month = 1; month <= 12; month += 1) {
      const monthData = apartment.months[String(month).padStart(2, '0')];
      if (!monthData) {
        row.push('');
        colors.push(COLORS.blank);
      } else {
        row.push(Number(monthData.paid) || 0);
        colors.push(statusColor_(monthData.status));
      }
    }
    row.push(Number(apartment.totalPaid) || 0, Number(apartment.totalRemaining) || 0);
    colors.push(COLORS.blank, COLORS.blank);
    backgrounds.push(colors);
    return row;
  });
  appendRows_(sheet, rows, headers.length);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setBackgrounds(backgrounds);
    sheet.getRange(2, 3, rows.length, 12).setNumberFormat('#,##0.## "ج"');
    sheet.getRange(2, 15, rows.length, 2).setNumberFormat('#,##0.## "ج"');
  }
}

function statusColor_(status) {
  if (status === 'مدفوع') return COLORS.paid;
  if (status === 'جزئي') return COLORS.partial;
  if (status === 'لم يدفع') return COLORS.unpaid;
  return COLORS.blank;
}

function writeSpecialCollections_(sheet, data) {
  const headers = ['التحصيل الخاص', 'رقم الشقة', 'اسم المالك', 'المطلوب', 'المدفوع', 'المتبقي', 'الحالة'];
  resetSheet_(sheet, headers, [190, 110, 180, 120, 120, 120, 110]);
  const rows = [];
  data.specialCollections.forEach(function (collection) {
    (collection.apartments || []).forEach(function (apartment) {
      rows.push([
        collection.title,
        apartment.number,
        apartment.ownerName,
        apartment.due,
        apartment.paid,
        apartment.remaining,
        apartment.status,
      ]);
    });
  });
  appendRows_(sheet, rows, headers.length);
  if (rows.length) {
    sheet.getRange(2, 4, rows.length, 3).setNumberFormat('#,##0.## "ج"');
    sheet.getRange(1, 1, rows.length + 1, headers.length).createFilter();
  }
}

function writeExpenses_(sheet, data) {
  const headers = ['التاريخ', 'النوع', 'المبلغ', 'ملاحظة', 'التحصيل المرتبط'];
  resetSheet_(sheet, headers, [120, 160, 120, 240, 190]);
  appendRows_(sheet, data.expenses.map(function (item) {
    return [item.date, item.category, item.amount, item.note, item.linkedCollection];
  }), headers.length);
  if (data.expenses.length) sheet.getRange(2, 3, data.expenses.length, 1).setNumberFormat('#,##0.## "ج"');
}

function writePayments_(sheet, data) {
  const headers = ['التاريخ', 'رقم الشقة', 'اسم المالك', 'النوع', 'الشهر / التحصيل', 'المبلغ'];
  resetSheet_(sheet, headers, [120, 110, 180, 140, 190, 120]);
  appendRows_(sheet, data.payments.map(function (item) {
    return [
      item.date,
      item.apartmentNumber,
      item.ownerName,
      item.type,
      item.monthOrCollection,
      item.amount,
    ];
  }), headers.length);
  if (data.payments.length) sheet.getRange(2, 6, data.payments.length, 1).setNumberFormat('#,##0.## "ج"');
}

function writeApartments_(sheet, data) {
  const headers = ['رقم الشقة', 'اسم المالك'];
  resetSheet_(sheet, headers, [140, 240]);
  appendRows_(sheet, data.apartments.map(function (item) {
    return [item.number, item.ownerName];
  }), headers.length);
}

function writeAdjustments_(sheet, data) {
  const headers = ['التاريخ', 'النوع', 'المبلغ', 'السبب', 'الحالة', 'سبب الإلغاء'];
  resetSheet_(sheet, headers, [120, 100, 120, 280, 100, 240]);
  appendRows_(sheet, data.adjustments.map(function (item) {
    return [item.date, item.type, item.amount, item.reason, item.status, item.cancelReason];
  }), headers.length);
  if (data.adjustments.length) {
    sheet.getRange(2, 3, data.adjustments.length, 1).setNumberFormat('#,##0.## "ج"');
    sheet.getRange(1, 1, data.adjustments.length + 1, headers.length).createFilter();
  }
}
