export function arabicErrorMessage(error: unknown, fallback: string): string {
  console.error(fallback, error);
  if (!(error instanceof Error)) return fallback;

  if (/unique constraint/i.test(error.message)) {
    return 'هذه البيانات مسجلة من قبل.';
  }
  if (/no monthly fee is configured/i.test(error.message)) {
    return 'لا توجد قيمة اشتراك مسجلة لهذا الشهر.';
  }
  if (/start_month setting is missing/i.test(error.message)) {
    return 'حدد شهر بداية تسجيل الاشتراكات من بيانات العمارة.';
  }
  if (/payment exceeds the remaining amount/i.test(error.message)) {
    return 'المبلغ أكبر من المتبقي على الشهور المحددة.';
  }
  return fallback;
}
