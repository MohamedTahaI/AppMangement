import { AppText } from '@/components/ui/AppText';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { formatDate } from '@/services/dateFormat';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  addExpense,
  getMonthlyExpenseTotal,
  listExpenseCategories,
  listExpenses,
  saveFixedExpense,
  softDeleteExpense,
  updateExpense,
  type Expense,
  type ExpenseCategory,
} from '@/db/expenses';
import { listSpecialCollections, type SpecialCollection } from '@/db/specials';
import { BigButton } from '@/components/ui/BigButton';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { FilterBar } from '@/components/ui/FilterBar';
import { getCurrentMonth, getMonthLabel } from '@/components/ui/MonthPicker';
import { MonthTransition } from '@/components/ui/MonthTransition';
import { MoneyText } from '@/components/ui/MoneyText';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { theme } from '@/components/ui/theme';
import { arabicErrorMessage } from '@/services/errors';

function localToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface PendingFixedSave {
  category: ExpenseCategory;
  amount: number | null;
}

export default function ExpensesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const [month, setMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sort, setSort] = useState('date');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [specials, setSpecials] = useState<SpecialCollection[]>([]);
  const [fixedAmounts, setFixedAmounts] = useState<Record<number, string>>({});
  const [monthTotal, setMonthTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingFixedId, setSavingFixedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingFixedSave, setPendingFixedSave] = useState<PendingFixedSave | null>(null);
  const [confirmFixedVisible, setConfirmFixedVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(localToday());
  const [note, setNote] = useState('');
  const [specialId, setSpecialId] = useState<number | null>(null);
  const [savingOther, setSavingOther] = useState(false);
  const [confirmEditVisible, setConfirmEditVisible] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allCategories, monthExpenses, collections, total] = await Promise.all([
        listExpenseCategories(true),
        listExpenses(month),
        listSpecialCollections(),
        getMonthlyExpenseTotal(month),
      ]);
      setCategories(allCategories);
      setExpenses(monthExpenses);
      setSpecials(collections);
      setMonthTotal(total);
      const nextFixedAmounts: Record<number, string> = {};
      for (const category of allCategories.filter((item) => item.is_fixed === 1 && item.active === 1)) {
        const existing = monthExpenses.filter((expense) => expense.category_id === category.id);
        const total = existing.reduce((sum, expense) => sum + expense.amount, 0);
        nextFixedAmounts[category.id] = existing.length > 0 ? String(total) : '';
      }
      setFixedAmounts(nextFixedAmounts);
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل المصروفات. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const openNewExpense = useCallback(() => {
    const firstOtherCategory = categories.find((item) => item.is_fixed === 0 && item.active === 1);
    setEditing(null);
    setCategoryId(firstOtherCategory?.id ?? null);
    setAmount('');
    setExpenseDate(localToday());
    setNote('');
    setSpecialId(null);
    setEditorVisible(true);
  }, [categories]);

  useFocusEffect(useCallback(() => {
    if (params.add === '1' && !loading) {
      openNewExpense();
      router.setParams({ add: undefined });
    }
  }, [loading, openNewExpense, params.add, router]));

  const openEditExpense = (expense: Expense) => {
    setEditing(expense);
    setCategoryId(expense.category_id);
    setAmount(String(expense.amount));
    setExpenseDate(expense.expense_date);
    setNote(expense.note);
    setSpecialId(expense.special_id);
    setEditorVisible(true);
  };

  const saveFixed = (category: ExpenseCategory) => {
    const raw = fixedAmounts[category.id]?.trim() ?? '';
    const parsedAmount = raw === '' ? null : Number(raw);
    if (parsedAmount !== null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      setError('اكتب مبلغاً صحيحاً للمصروف.');
      return;
    }
    const existing = expenses.find((expense) => expense.category_id === category.id);
    const differs = parsedAmount === null ? existing !== undefined : existing?.amount !== parsedAmount;
    if (existing && differs) {
      setPendingFixedSave({ category, amount: parsedAmount });
      setConfirmFixedVisible(true);
      return;
    }
    void persistFixed(category, parsedAmount);
  };

  const persistFixed = async (category: ExpenseCategory, fixedAmount: number | null) => {
    setSavingFixedId(category.id);
    setError(null);
    setNotice(null);
    try {
      await saveFixedExpense(category.id, month, fixedAmount, `${month}-01`);
      setConfirmFixedVisible(false);
      setPendingFixedSave(null);
      setNotice(
        fixedAmount === null
          ? `تم تسجيل أن «${category.name}» لم يحدث هذا الشهر.`
          : `تم حفظ «${category.name}» لهذا الشهر.`,
      );
      await load();
    } catch (saveError) {
      setError(arabicErrorMessage(saveError, 'تعذر حفظ المصروف الثابت. حاول مرة أخرى.'));
    } finally {
      setSavingFixedId(null);
    }
  };

  const saveOther = async (confirmed = false) => {
    const parsedAmount = Number(amount);
    if (
      categoryId === null
      || !categories.some(
        (item) =>
          item.id === categoryId
          && ((item.is_fixed === 0 && item.active === 1) || editing?.category_id === item.id),
      )
    ) {
      setError('اختر نوع المصروف.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('اكتب مبلغاً صحيحاً.');
      return;
    }
    if (editing && !confirmed) {
      setConfirmEditVisible(true);
      return;
    }
    setSavingOther(true);
    setError(null);
    try {
      const values = {
        category_id: categoryId,
        amount: parsedAmount,
        expense_date: expenseDate,
        month,
        note: note.trim(),
        special_id: specialId,
      };
      if (editing) {
        await updateExpense(editing.id, values);
      } else {
        await addExpense(values);
      }
      setConfirmEditVisible(false);
      setEditorVisible(false);
      setNotice(editing ? 'تم حفظ تعديلات المصروف.' : 'تمت إضافة المصروف.');
      await load();
    } catch (saveError) {
      setError(arabicErrorMessage(saveError, 'تعذر حفظ المصروف. تحقق من البيانات وحاول مرة أخرى.'));
    } finally {
      setSavingOther(false);
    }
  };

  const deleteOther = async () => {
    if (!pendingDelete) return;
    try {
      await softDeleteExpense(pendingDelete.id);
      setPendingDelete(null);
      setNotice('تم حذف المصروف.');
      await load();
    } catch (deleteError) {
      setError(arabicErrorMessage(deleteError, 'تعذر حذف المصروف. حاول مرة أخرى.'));
      setPendingDelete(null);
    }
  };

  const fixedCategories = categories.filter(
    (category) => category.is_fixed === 1 && category.active === 1,
  ).filter((category) => (
    (categoryFilter === 'all' || categoryFilter === 'fixed' || categoryFilter === String(category.id))
    && category.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ));
  const otherExpenses = expenses.filter((expense) => {
    const category = categories.find((item) => item.id === expense.category_id);
    const isOther = !category || category.is_fixed === 0 || category.active === 0;
    const categoryMatches = categoryFilter === 'all'
      || categoryFilter === 'other'
      || categoryFilter === String(expense.category_id);
    const searchMatches = `${category?.name ?? ''} ${expense.note} ${expense.expense_date}`
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return isOther && categoryMatches && searchMatches;
  }).sort((a, b) => sort === 'amount' ? b.amount - a.amount : b.expense_date.localeCompare(a.expense_date));

  return (
    <>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="المصروفات" />
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          month={month}
          onMonthChange={(nextMonth) => {
            setMonth(nextMonth);
            setNotice(null);
          }}
          defaultSort="date"
          sort={sort}
          sortOptions={[
            { value: 'date', label: 'التاريخ' },
            { value: 'amount', label: 'أكبر مبلغ' },
          ]}
          onSortChange={setSort}
          extraFilterCount={Number(categoryFilter !== 'all')}
          mainFilters={
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptions}>
              {[
                { value: 'all', label: 'الكل' },
                { value: 'fixed', label: 'الثابتة' },
                { value: 'other', label: 'الأخرى' },
                ...categories.map((category) => ({ value: String(category.id), label: category.name })),
              ].map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: categoryFilter === option.value }}
                  onPress={() => setCategoryFilter(option.value)}
                  style={[styles.filterOption, categoryFilter === option.value && styles.filterOptionSelected]}>
                  <AppText style={[styles.filterOptionText, categoryFilter === option.value && styles.filterOptionTextSelected]}>
                    {option.label}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          }
          resultCount={fixedCategories.length + otherExpenses.length}
          totalCount={categories.filter((category) => category.active === 1).length + expenses.length}
          totalAmount={otherExpenses.reduce((sum, expense) => sum + expense.amount, 0)
            + fixedCategories.reduce((sum, category) => sum + (Number(fixedAmounts[category.id]) || 0), 0)}
          onClear={() => { setSearch(''); setCategoryFilter('all'); setSort('date'); setMonth(getCurrentMonth()); }}
        />
        <MonthTransition month={month}>
        <Card variant="surface" style={styles.totalCard}>
          <AppText style={styles.totalLabel}>إجمالي مصروفات {getMonthLabel(month)}</AppText>
          <MoneyText amount={monthTotal} />
        </Card>
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        {notice ? <AppText style={styles.success}>{notice}</AppText> : null}
        {loading ? <AppText style={styles.message}>جارٍ تحميل المصروفات...</AppText> : null}

        <SectionHeader title="المصروفات الثابتة" />
        {!loading && fixedCategories.length === 0 ? (
          <EmptyState message="لا توجد أنواع مصروفات ثابتة. أضف نوعاً من المزيد." />
        ) : null}
        {fixedCategories.map((category) => {
          const exists = expenses.some((expense) => expense.category_id === category.id);
          return (
            <Card key={category.id}>
              <AppText style={styles.categoryTitle}>{category.name}</AppText>
              <FormField
                label="المبلغ"
                value={fixedAmounts[category.id] ?? ''}
                onChangeText={(value) =>
                  setFixedAmounts((current) => ({ ...current, [category.id]: value }))
                }
                keyboardType="decimal-pad"
                placeholder="اتركه فارغاً إذا لم يحدث"
              />
              {!exists && !fixedAmounts[category.id] ? (
                <AppText style={styles.helper}>لم يحدث هذا الشهر</AppText>
              ) : null}
              <BigButton
                title={savingFixedId === category.id ? 'جارٍ الحفظ...' : 'حفظ'}
                onPress={() => saveFixed(category)}
                disabled={savingFixedId === category.id || loading}
              />
            </Card>
          );
        })}

        <SectionHeader
          title="مصروفات أخرى"
          style={styles.otherHeader}
          action={
          <BigButton
            title="إضافة مصروف"
            onPress={openNewExpense}
            size="compact"
            icon="add"
            numberOfLines={1}
            style={styles.addButton}
            disabled={!categories.some((item) => item.is_fixed === 0 && item.active === 1)}
          />
          }
        />
        {!loading && otherExpenses.length === 0 ? (
          <EmptyState message="لا توجد مصروفات أخرى لهذا الشهر." />
        ) : null}
        {otherExpenses.map((expense) => {
          const category = categories.find((item) => item.id === expense.category_id);
          return (
            <Card key={expense.id}>
              <View style={styles.expenseRow}>
                <View style={styles.expenseInfo}>
                  <AppText style={styles.categoryTitle}>{category?.name ?? 'مصروف'}</AppText>
                  <AppText style={styles.helper}>{formatDate(expense.expense_date)}</AppText>
                  {expense.note ? <AppText style={styles.helper}>{expense.note}</AppText> : null}
                  {expense.special_id !== null ? (
                    <AppText style={styles.helper}>
                      {specials.find((item) => item.id === expense.special_id)?.title ?? 'تحصيل خاص'}
                    </AppText>
                  ) : null}
                </View>
                <MoneyText amount={expense.amount} size={theme.typography.section} />
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => openEditExpense(expense)} style={styles.actionButton}>
                  <AppText style={styles.actionText}>تعديل</AppText>
                </Pressable>
                <Pressable onPress={() => setPendingDelete(expense)} style={styles.actionButton}>
                  <AppText style={styles.deleteText}>حذف</AppText>
                </Pressable>
              </View>
            </Card>
          );
        })}
        </MonthTransition>
      </ScrollView>

      <AppBottomSheet
        visible={editorVisible}
        title={editing ? 'تعديل المصروف' : 'إضافة مصروف'}
        snapPoints={['75%', '90%']}
        onClose={() => setEditorVisible(false)}>
            <AppText style={styles.fieldLabel}>نوع المصروف</AppText>
            {categories.filter(
              (item) =>
                (item.is_fixed === 0 && item.active === 1)
                || editing?.category_id === item.id,
            ).length === 0 ? (
              <EmptyState message="أضف نوع مصروف غير ثابت من المزيد أولاً." />
            ) : null}
            <View style={styles.optionList}>
              {categories
                .filter(
                  (item) =>
                    (item.is_fixed === 0 && item.active === 1)
                    || editing?.category_id === item.id,
                )
                .map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => setCategoryId(category.id)}
                  style={[styles.option, categoryId === category.id && styles.selectedOption]}>
                  <AppText style={styles.optionText}>{category.name}</AppText>
                </Pressable>
              ))}
            </View>
            <FormField label="المبلغ" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <FormField label="التاريخ" value={expenseDate} onChangeText={setExpenseDate} placeholder="مثال: 2026-01-31" />
            <FormField label="ملاحظة (اختياري)" value={note} onChangeText={setNote} />
            <AppText style={styles.fieldLabel}>من أي تحصيل خاص؟ (اختياري)</AppText>
            <View style={styles.optionList}>
              {specials.length === 0 ? (
                <EmptyState message="لا توجد تحصيلات خاصة محفوظة." />
              ) : null}
              <Pressable
                onPress={() => setSpecialId(null)}
                style={[styles.option, specialId === null && styles.selectedOption]}>
                <AppText style={styles.optionText}>بدون تحصيل خاص</AppText>
              </Pressable>
              {specials.map((special) => (
                <Pressable
                  key={special.id}
                  onPress={() => setSpecialId(special.id)}
                  style={[styles.option, specialId === special.id && styles.selectedOption]}>
                  <AppText style={styles.optionText}>{special.title}</AppText>
                </Pressable>
              ))}
            </View>
            {error ? <AppText style={styles.error}>{error}</AppText> : null}
            <BigButton
              title="حفظ المصروف"
              onPress={() => void saveOther()}
              loading={savingOther}
            />
            <BigButton
              title="إلغاء"
              variant="secondary"
              disabled={savingOther}
              onPress={() => setEditorVisible(false)}
            />
      </AppBottomSheet>

      <ConfirmDialog
        visible={confirmFixedVisible}
        title="تأكيد تغيير المصروف الثابت"
        message={
          pendingFixedSave?.amount === null
            ? `هل تريد تسجيل أن «${pendingFixedSave?.category.name ?? ''}» لم يحدث هذا الشهر؟ سيتم إزالته من مصروفات الشهر.`
            : `هل تريد استبدال مبلغ «${pendingFixedSave?.category.name ?? ''}» لهذا الشهر؟`
        }
        confirmLabel="نعم، احفظ"
        onConfirm={() => {
          if (pendingFixedSave) void persistFixed(pendingFixedSave.category, pendingFixedSave.amount);
        }}
        onCancel={() => {
          setConfirmFixedVisible(false);
          setPendingFixedSave(null);
        }}
      />
      <ConfirmDialog
        visible={confirmEditVisible}
        title="حفظ تعديل المصروف"
        message="هل تريد حفظ التغييرات على هذا المصروف؟"
        onConfirm={() => void saveOther(true)}
        onCancel={() => setConfirmEditVisible(false)}
      />
      <ConfirmDialog
        visible={pendingDelete !== null}
        title="حذف المصروف"
        message={`هل تريد حذف مصروف ${pendingDelete?.amount ?? 0} ج؟`}
        confirmLabel="نعم، احذفه"
        destructive
        onConfirm={() => void deleteOther()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: theme.spacingScale.screen,
    paddingTop: theme.spacingScale.md,
    paddingBottom: theme.spacingScale.lg,
    gap: theme.spacingScale.sm,
    backgroundColor: theme.colors.background,
    writingDirection: 'rtl',
    direction: 'rtl',
  },
  totalCard: {
    alignItems: 'stretch',
  },
  filterOptions: { gap: theme.spacingScale.xs, paddingVertical: theme.spacingScale.xs },
  filterOption: {
    minHeight: theme.sizes.touch,
    paddingHorizontal: theme.spacingScale.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  filterOptionSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterOptionText: { color: theme.colors.text, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  filterOptionTextSelected: { color: theme.colors.onPrimary },
  totalLabel: {
    width: '100%',
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  sectionTitle: {
    width: '100%',
    color: theme.colors.text,
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  addButton: {
    width: '100%',
    minWidth: 0,
  },
  otherHeader: { marginBottom: 12 },
  categoryTitle: {
    width: '100%',
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  helper: {
    width: '100%',
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  message: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'center',
  },
  error: {
    width: '100%',
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  success: {
    width: '100%',
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacingScale.xs,
    alignItems: 'flex-start',
  },
  expenseInfo: {
    flex: 1,
    gap: theme.spacingScale.xs,
    alignItems: 'flex-end',
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacingScale.xs,
  },
  actionButton: {
    minWidth: theme.sizes.rowLarge,
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    color: theme.colors.primary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  deleteText: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  fieldLabel: {
    width: '100%',
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  optionList: {
    gap: theme.spacingScale.xs,
  },
  option: {
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
    paddingHorizontal: theme.spacingScale.sm,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
  },
  selectedOption: {
    borderWidth: theme.borderWidths.strong,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.successBackground,
  },
  optionText: {
    width: '100%',
    color: theme.colors.text,
    fontSize: theme.typography.body,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
});
