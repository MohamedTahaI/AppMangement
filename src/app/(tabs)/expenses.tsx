import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
          sort={sort}
          sortOptions={[
            { value: 'date', label: 'التاريخ' },
            { value: 'amount', label: 'أكبر مبلغ' },
          ]}
          onSortChange={setSort}
          extraFilterCount={Number(categoryFilter !== 'all')}
          extraFilters={
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
                  <Text style={[styles.filterOptionText, categoryFilter === option.value && styles.filterOptionTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          }
          resultCount={fixedCategories.length + otherExpenses.length}
          totalCount={categories.filter((category) => category.active === 1).length + expenses.length}
          totalAmount={otherExpenses.reduce((sum, expense) => sum + expense.amount, 0)
            + fixedCategories.reduce((sum, category) => sum + (Number(fixedAmounts[category.id]) || 0), 0)}
          onClear={() => { setSearch(''); setCategoryFilter('all'); setSort('date'); }}
        />
        <MonthTransition month={month}>
        <Card variant="surface" style={styles.totalCard}>
          <Text style={styles.totalLabel}>إجمالي مصروفات {getMonthLabel(month)}</Text>
          <MoneyText amount={monthTotal} />
        </Card>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.success}>{notice}</Text> : null}
        {loading ? <Text style={styles.message}>جارٍ تحميل المصروفات...</Text> : null}

        <Text style={styles.sectionTitle}>المصروفات الثابتة</Text>
        {!loading && fixedCategories.length === 0 ? (
          <EmptyState message="لا توجد أنواع مصروفات ثابتة. أضف نوعاً من المزيد." />
        ) : null}
        {fixedCategories.map((category) => {
          const exists = expenses.some((expense) => expense.category_id === category.id);
          return (
            <Card key={category.id}>
              <Text style={styles.categoryTitle}>{category.name}</Text>
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
                <Text style={styles.helper}>لم يحدث هذا الشهر</Text>
              ) : null}
              <BigButton
                title={savingFixedId === category.id ? 'جارٍ الحفظ...' : 'حفظ'}
                onPress={() => saveFixed(category)}
                disabled={savingFixedId === category.id || loading}
              />
            </Card>
          );
        })}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>مصروفات أخرى</Text>
          <BigButton
            title="إضافة مصروف"
            onPress={openNewExpense}
            style={styles.addButton}
            disabled={!categories.some((item) => item.is_fixed === 0 && item.active === 1)}
          />
        </View>
        {!loading && otherExpenses.length === 0 ? (
          <EmptyState message="لا توجد مصروفات أخرى لهذا الشهر." />
        ) : null}
        {otherExpenses.map((expense) => {
          const category = categories.find((item) => item.id === expense.category_id);
          return (
            <Card key={expense.id}>
              <View style={styles.expenseRow}>
                <View style={styles.expenseInfo}>
                  <Text style={styles.categoryTitle}>{category?.name ?? 'مصروف'}</Text>
                  <Text style={styles.helper}>{expense.expense_date}</Text>
                  {expense.note ? <Text style={styles.helper}>{expense.note}</Text> : null}
                  {expense.special_id !== null ? (
                    <Text style={styles.helper}>
                      {specials.find((item) => item.id === expense.special_id)?.title ?? 'تحصيل خاص'}
                    </Text>
                  ) : null}
                </View>
                <MoneyText amount={expense.amount} size={theme.typography.section} />
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => openEditExpense(expense)} style={styles.actionButton}>
                  <Text style={styles.actionText}>تعديل</Text>
                </Pressable>
                <Pressable onPress={() => setPendingDelete(expense)} style={styles.actionButton}>
                  <Text style={styles.deleteText}>حذف</Text>
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
            <Text style={styles.fieldLabel}>نوع المصروف</Text>
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
                  <Text style={styles.optionText}>{category.name}</Text>
                </Pressable>
              ))}
            </View>
            <FormField label="المبلغ" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <FormField label="التاريخ" value={expenseDate} onChangeText={setExpenseDate} placeholder="مثال: 2026-01-31" />
            <FormField label="ملاحظة (اختياري)" value={note} onChangeText={setNote} />
            <Text style={styles.fieldLabel}>من أي تحصيل خاص؟ (اختياري)</Text>
            <View style={styles.optionList}>
              {specials.length === 0 ? (
                <EmptyState message="لا توجد تحصيلات خاصة محفوظة." />
              ) : null}
              <Pressable
                onPress={() => setSpecialId(null)}
                style={[styles.option, specialId === null && styles.selectedOption]}>
                <Text style={styles.optionText}>بدون تحصيل خاص</Text>
              </Pressable>
              {specials.map((special) => (
                <Pressable
                  key={special.id}
                  onPress={() => setSpecialId(special.id)}
                  style={[styles.option, specialId === special.id && styles.selectedOption]}>
                  <Text style={styles.optionText}>{special.title}</Text>
                </Pressable>
              ))}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
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
  },
  totalCard: {
    alignItems: 'flex-end',
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
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.extraBold,
    textAlign: 'right',
  },
  sectionHeader: {
    gap: theme.spacingScale.xs,
    alignItems: 'stretch',
  },
  addButton: {
    minHeight: theme.sizes.touchCompact + theme.spacingScale.xs / 2,
  },
  categoryTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.extraBold,
    textAlign: 'right',
  },
  helper: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
  message: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    textAlign: 'center',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
  success: {
    color: theme.colors.success,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
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
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
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
    color: theme.colors.text,
    fontSize: theme.typography.body,
    textAlign: 'right',
  },
});
