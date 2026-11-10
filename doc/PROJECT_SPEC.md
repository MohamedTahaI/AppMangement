# Building Finance Manager — Project Spec

## What this app is
Target platform: Android only. Do not add iOS-specific code or settings.
A mobile app (Android first) used by ONE person only: the building manager (not tech-savvy).
He tracks: monthly dues from each apartment, one-time special collections (e.g. elevator repair), and building expenses.
All data lives locally on his phone (SQLite = source of truth).
Every change is mirrored to a Google Sheet that residents can VIEW only. Only the app (through a Google Apps Script web app) writes to that sheet.

## Rules for the AI developer
- Work phase by phase. Do ONLY the phase I ask for. Do not touch unrelated files.
- Keep code simple and readable. Comments in English.
- If something is ambiguous, ask me instead of guessing.
- After each phase, tell me in simple Arabic: what you built, how to test it on my phone, and what I should see.
- Do not add libraries that are not listed here without asking.

## Tech stack
Expo (React Native) + TypeScript + Expo Router.
expo-sqlite, expo-print, expo-sharing, expo-file-system, expo-document-picker, xlsx (SheetJS). No backend server.

## UX rules (very important)
- UI language: Arabic, full RTL. Numbers in Western digits (0-9). Currency label: "ج".
- The user is not tech-savvy: big text (min 18), big buttons, high contrast, simple words, no jargon.
- Max 4 bottom tabs: الرئيسية، التحصيل، المصروفات، المزيد.
- Every delete/overwrite asks for confirmation in Arabic.
- Every list has an empty-state message. Show loading and error states in Arabic.
- Wherever a month matters, show a month picker (default = current month).

## Data model (SQLite)
apartments: id, number (TEXT, unique), owner_name, active (1/0)
fee_rates: id, effective_from ('YYYY-MM'), amount
special_collections: id, title, amount_per_apartment, date, note, active
charges: id, apartment_id, type ('monthly'|'special'), month ('YYYY-MM' or NULL), special_id (or NULL), amount_due
  unique (apartment_id, month) for monthly; unique (apartment_id, special_id) for special
payments: id, charge_id, amount, paid_date, note, deleted (0/1), created_at
expense_categories: id, name, is_fixed (1/0), active
expenses: id, category_id, amount, expense_date, month ('YYYY-MM'), note, special_id (nullable), deleted (0/1)
settings: key, value (building_name, start_month, sheet_url, sheet_secret, last_synced_at, dirty, last_backup_at, last_sync_error)

Default fixed categories: مرتب الحارس، القمامة، المنظفات، الكهرباء، المياه
Default non-fixed categories: صيانة، أخرى

## Business rules
1. Monthly fee for month M = the fee_rates row with the latest effective_from <= M. Changing the fee affects only months from the chosen month onward; existing charges keep their old amount.
2. Monthly invoices: one per active apartment per month. Auto-create them for every month from start_month up to the current month when missing (run on app open and when a month is opened).
3. Advance payment: if the manager pays a future month, create that month's charge on the spot using that month's fee.
4. One payment action can cover several months: the manager ticks months and enters an amount; the app distributes it oldest to newest, creating one payment row per charge.
5. Partial payments allowed. Status: paid (paid >= due), partial (0 < paid < due), unpaid (paid = 0). Paying more than the remaining on a charge is not allowed (warn).
6. Special collection: title + amount per apartment + date creates one charge for every active apartment. A single apartment's amount can be edited later. Apartments added later do not get past special charges automatically.
7. Expenses: fixed categories appear every month as a checklist. Each can be empty (did not happen) or have a different amount than last month. Other expenses (maintenance, etc.) can be added any time. An expense can optionally be linked to a special collection (to see what is left of that fund).
8. Apartments with history are never hard-deleted (active = 0). Payments and expenses are soft-deleted (deleted = 1).
9. Home dashboard, for the selected month (default current): total collected (all time), this month's collection, this month's expenses. Smaller line: balance = total collected - total expenses.
10. Every write function in the DB layer calls markDirty() (sets settings.dirty = 1). Sync uses it later.

## Screens
Home: 3 big cards + balance + shortcut "who has not paid this month" + backup reminder if last backup > 7 days + sync status dot.
Collection tab: (a) monthly: month picker, apartments with status chip, "unpaid only" switch, collect-payment flow; (b) special collections: list, create, details per apartment.
Expenses tab: month picker, fixed checklist, other expenses list, add expense.
More tab: apartments, change monthly fee, expense categories, export (PDF/Excel), backup/restore, online sheet connection + "sync now", building info.

## Google Sheet (written only by the Apps Script; tab names in Arabic)
1. ملخص: building name, last update time, total collected, total expenses, balance, table per month (collected, expenses).
2. الفاتورة الشهرية YYYY: one row per apartment: number, owner, 12 month columns (amount paid; green = paid in full, orange = partial, red = due and unpaid, blank = not due yet), total paid, total remaining.
3. التحصيلات الخاصة: flat table: collection title, apartment, owner, due, paid, remaining, status. With a filter.
4. المصروفات: date, category, amount, note, linked collection.
5. سجل المدفوعات: date, apartment, owner, type, month/collection, amount.
6. الشقق: number, owner.

## Sync design
- App -> Apps Script only (one-way). The app sends the FULL snapshot as JSON; the script clears and rewrites all tabs. (Data is small; avoids inconsistency; the same mechanism rebuilds a brand-new sheet.)
- POST with header Content-Type: text/plain;charset=utf-8, body = JSON string { secret, action: 'sync' | 'ping', data }. The script reads e.postData.contents.
- The script checks the secret, uses LockService, and returns JSON { ok, error? }.
- Auto sync about 3 seconds after the last change when settings.dirty = 1 and the phone is online; otherwise retry the next time the app opens. A manual "sync now" button shows the last sync time and any error in simple Arabic.
- sheet_url and sheet_secret are entered in Settings (never hard-coded in the app).