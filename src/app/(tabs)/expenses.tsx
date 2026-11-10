import { AppText } from '@/components/ui/AppText';
import { Section } from '@/components/ui/Section';
import { Screen } from '@/components/ui/Screen';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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
import { ActivityRow } from '@/components/ui/ActivityRow';
import { getCurrentMonth, getMonthLabel } from '@/components/ui/MonthPicker';
import { MonthTransition } from '@/components/ui/MonthTransition';
import { MoneyText } from '@/components/ui/MoneyText';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { theme } from '@/theme';
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
  const [fixedOriginals, setFixedOriginals] = useState<Record<number, string>>({});
  const [monthTotal, setMonthTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingFixedId, setSavingFixedId] = useState<number | null>(null);
  const [savedFixed, setSavedFixed] = useState<number | null>(null);
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

  useEffect(() => {
    if (savedFixed !== null) {
      const timer = setTimeout(() => setSavedFixed(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [savedFixed]);

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
      setFixedOriginals(nextFixedAmounts);
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
      setSavedFixed(category.id);
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

  const hasOtherCategory = categories.some((item) => item.is_fixed === 0 && item.active === 1);

  return (
    <Screen>
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

        <Section
          title="المصروفات الثابتة"
          subtitle="اترك الخانة فاضية لو المصروف لم يحدث هذا الشهر"
        >
          {!loading && fixedCategories.length === 0 ? (
            <EmptyState message="لا توجد أنواع مصروفات ثابتة. أضف نوعاً من المزيد." />
          ) : null}
          {fixedCategories.map((category) => {
            const original = fixedOriginals[category.id] ?? '';
            const current = fixedAmounts[category.id] ?? '';
            const changed = current.trim() !== original.trim();
            const isSaving = savingFixedId === category.id;
            const saved = savedFixed === category.id;
            return (
              <Card key={category.id} variant="surface" style={styles.fixedRow}>
                <AppText
                  style={styles.fixedName}
                  numberOfLines={1}
                  accessibilityLabel={`مصروف ثابت: ${category.name}`}
                >
                  {category.name}
                </AppText>
                <TextInput
                  style={styles.fixedInput}
                  value={current}
                  onChangeText={(value) =>
                    setFixedAmounts((currentValues) => ({ ...currentValues, [category.id]: value }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={theme.colors.muted}
                  accessibilityLabel="المبلغ"
                />
                {saved ? (
                  <AppText style={styles.savedText}>تم الحفظ</AppText>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`حفظ ${category.name}`}
                    disabled={!changed || isSaving || loading}
                    onPress={() => saveFixed(category)}
                    style={styles.saveButton}
                  >
                    <MaterialIcons name="check" size={20} color={theme.colors.onPrimary} />
                  </Pressable>
                )}
              </Card>
            );
          })}
        </Section>

        <Section
          title="مصروفات أخرى"
          action={
            <BigButton
              title="إضافة مصروف"
              icon="add"
              size="compact"
              numberOfLines={1}
              onPress={openNewExpense}
              disabled={!hasOtherCategory}
              style={{ height: 40, minHeight: 40 }}
            />
          }
        >
          {!loading && otherExpenses.length === 0 ? (
            <EmptyState message="لا توجد مصروفات أخرى لهذا الشهر." />
          ) : null}
          {otherExpenses.map((expense) => {
            const category = categories.find((item) => item.id === expense.category_id);
            const special = specials.find((item) => item.id === expense.special_id);
            return (
              <ActivityRow
                key={expense.id}
                type="expense"
                title={category?.name ?? 'مصروف'}
                date={expense.expense_date}
                note={expense.note
                  ? special
                    ? `${expense.note} · ${special.title}`
                    : expense.note
                  : special
                    ? special.title
                    : ''}
                amount={-expense.amount}
                onPress={() => openEditExpense(expense)}
              />
            );
          })}
        </Section>
      </MonthTransition>

      <AppBottomSheet
        visible={editorVisible}
        title={editing ? 'تعديل المصروف' : 'إضافة مصروف'}
        snapPoints={['75%', '90%']}
        onClose={() => setEditorVisible(false)}>
        <FormField label="نوع المصروف" value={categoryId === null ? '' : String(categoryId)} onChangeText={(t) => setCategoryId(t ? Number(t) : null)} />
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
            .map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setCategoryId(item.id)}
                style={[styles.option, categoryId === item.id && styles.selectedOption]}>
                <AppText style={styles.optionText}>{item.name}</AppText>
              </Pressable>
            ))}
        </View>
        <FormField label="المبلغ" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="أدخل المبلغ" />
        <FormField label="تاريخ المصروف" value={expenseDate} onChangeText={setExpenseDate} />
        <FormField label="ملاحظة (اختياري)" value={note} onChangeText={setNote} />
        <FormField label="من أي تحصيل خاص؟ (اختياري)" />
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
        {editing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="حذف هذا المصروف"
            onPress={() => { setEditorVisible(false); setPendingDelete(editing); }}
            style={styles.deleteEditor}
          >
            <AppText style={styles.deleteEditorText}>حذف هذا المصروف</AppText>
          </Pressable>
        ) : null}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    writingDirection: 'rtl',
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
  fixedRow: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacingScale.xs,
    minHeight: 72,
  },
  fixedName: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 18,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  fixedInput: {
    width: 110,
    height: 44,
    fontSize: 18,
    fontFamily: theme.typography.bold,
    textAlign: 'center',
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 8,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  saveButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedText: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.small,
    fontFamily: theme.typography.medium,
    textAlign: 'auto',
  },
  optionList: { gap: theme.spacingScale.xs },
  option: {
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
    paddingHorizontal: theme.spacingScale.sm,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
  },
  selectedOption: { borderWidth: theme.borderWidths.strong, borderColor: theme.colors.primary, backgroundColor: theme.colors.successBackground },
  optionText: {
    width: '100%',
    color: theme.colors.text,
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
  deleteEditor: {
    alignSelf: 'flex-start',
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
    paddingHorizontal: theme.spacingScale.sm,
  },
  deleteEditorText: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
});
