import { AppText } from '@/components/ui/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import {
  addExpenseCategory,
  listExpenseCategories,
  softDeleteExpenseCategory,
  updateExpenseCategory,
  type ExpenseCategory,
} from '@/db/expenses';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Screen } from '@/components/ui/Screen';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { theme } from '@/components/ui/theme';
import { arabicErrorMessage } from '@/services/errors';

export default function ExpenseCategoriesScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmSaveVisible, setConfirmSaveVisible] = useState(false);
  const [pendingHide, setPendingHide] = useState<ExpenseCategory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await listExpenseCategories());
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل أنواع المصروفات. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const openNew = () => {
    setEditing(null);
    setName('');
    setIsFixed(false);
    setEditorVisible(true);
  };

  const openEdit = (category: ExpenseCategory) => {
    setEditing(category);
    setName(category.name);
    setIsFixed(category.is_fixed === 1);
    setEditorVisible(true);
  };

  const save = async (confirmed = false) => {
    if (!name.trim()) {
      setError('اكتب اسم نوع المصروف.');
      return;
    }
    if (editing && !confirmed) {
      setConfirmSaveVisible(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateExpenseCategory(editing.id, name, isFixed);
      } else {
        await addExpenseCategory(name, isFixed);
      }
      setConfirmSaveVisible(false);
      setEditorVisible(false);
      await load();
    } catch (saveError) {
      setError(arabicErrorMessage(saveError, 'تعذر حفظ نوع المصروف. تحقق من الاسم وحاول مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  };

  const hide = async () => {
    if (!pendingHide) return;
    try {
      await softDeleteExpenseCategory(pendingHide.id);
      setPendingHide(null);
      await load();
    } catch (hideError) {
      setError(arabicErrorMessage(hideError, 'تعذر إخفاء نوع المصروف. حاول مرة أخرى.'));
      setPendingHide(null);
    }
  };

  return (
    <>
      <Screen>
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle title="أنواع المصروفات" subtitle="إضافة الأنواع أو تعديلها أو إخفاؤها" />
        <BigButton title="إضافة نوع مصروف" onPress={openNew} />
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        {loading ? <AppText style={styles.message}>جارٍ تحميل الأنواع...</AppText> : null}
        {!loading && categories.length === 0 ? (
          <EmptyState message="لا توجد أنواع مصروفات ظاهرة." />
        ) : null}
        {categories.map((category) => (
          <Card key={category.id}>
            <AppText style={styles.categoryName}>{category.name}</AppText>
            <AppText style={styles.kind}>{category.is_fixed ? 'مصروف ثابت شهري' : 'مصروف آخر'}</AppText>
            <View style={styles.actions}>
              <Pressable style={styles.actionButton} onPress={() => openEdit(category)}>
                <AppText style={styles.actionText}>تعديل</AppText>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setPendingHide(category)}>
                <AppText style={styles.hideText}>إخفاء</AppText>
              </Pressable>
            </View>
          </Card>
        ))}
      </Screen>

      <AppBottomSheet
        visible={editorVisible}
        title={editing ? 'تعديل نوع المصروف' : 'إضافة نوع مصروف'}
        snapPoints={['52%']}
        onClose={() => setEditorVisible(false)}>
        <FormField label="اسم النوع" value={name} onChangeText={setName} />
        <View style={styles.switchRow}>
          <AppText style={styles.switchLabel}>مصروف ثابت كل شهر</AppText>
          <Switch
            value={isFixed}
            onValueChange={setIsFixed}
            trackColor={{ true: theme.colors.primary }}
            accessibilityLabel="مصروف ثابت كل شهر"
          />
        </View>
        {error ? <AppText style={styles.error}>{error}</AppText> : null}
        <BigButton title="حفظ" loading={saving} onPress={() => void save()} />
        <BigButton
          title="إلغاء"
          variant="secondary"
          disabled={saving}
          onPress={() => setEditorVisible(false)}
        />
      </AppBottomSheet>

      <ConfirmDialog
        visible={confirmSaveVisible}
        title="حفظ التعديلات"
        message="هل تريد حفظ التغييرات على نوع المصروف؟"
        confirmDisabled={saving}
        onConfirm={() => void save(true)}
        onCancel={() => setConfirmSaveVisible(false)}
      />
      <ConfirmDialog
        visible={pendingHide !== null}
        title="إخفاء النوع"
        message={`هل تريد إخفاء نوع المصروف «${pendingHide?.name ?? ''}»؟ ستبقى مصروفاته السابقة محفوظة.`}
        confirmLabel="نعم، أخفه"
        destructive
        onConfirm={() => void hide()}
        onCancel={() => setPendingHide(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
  },
  backText: {
    color: theme.colors.primary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  categoryName: {
    color: theme.colors.text,
    fontSize: theme.typography.section,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
  },
  kind: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'auto',
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacingScale.xs,
  },
  actionButton: {
    minWidth: theme.sizes.categoryActionWidth,
    minHeight: theme.sizes.touchCompact,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    color: theme.colors.primary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  hideText: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
  message: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'center',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  switchRow: {
    minHeight: theme.sizes.touchMedium,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
});
