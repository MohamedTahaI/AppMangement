import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { getSetting, setSetting } from '@/db/settings';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { MonthPicker, getCurrentMonth, getMonthLabel } from '@/components/ui/MonthPicker';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { Skeleton } from '@/components/ui/Skeleton';
import { SuccessSheet } from '@/components/ui/SuccessSheet';
import { theme } from '@/components/ui/theme';
import { arabicErrorMessage } from '@/services/errors';

export default function BuildingScreen() {
  const router = useRouter();
  const [buildingName, setBuildingName] = useState('');
  const [startMonth, setStartMonth] = useState(getCurrentMonth());
  const [originalName, setOriginalName] = useState('');
  const [originalStartMonth, setOriginalStartMonth] = useState(getCurrentMonth());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [name, month] = await Promise.all([
        getSetting('building_name'),
        getSetting('start_month'),
      ]);
      const savedName = name ?? '';
      const savedMonth = month ?? getCurrentMonth();
      setBuildingName(savedName);
      setStartMonth(savedMonth);
      setOriginalName(savedName);
      setOriginalStartMonth(savedMonth);
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل بيانات العمارة. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const save = async (confirmed = false) => {
    const changed = buildingName.trim() !== originalName || startMonth !== originalStartMonth;
    if (changed && !confirmed) {
      setConfirmVisible(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setSetting('building_name', buildingName.trim());
      await setSetting('start_month', startMonth);
      setOriginalName(buildingName.trim());
      setOriginalStartMonth(startMonth);
      setConfirmVisible(false);
      setEditorVisible(false);
      setSuccessVisible(true);
    } catch (saveError) {
      setError(arabicErrorMessage(saveError, 'تعذر حفظ بيانات العمارة. حاول مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  };

  const cancelEditor = () => {
    setBuildingName(originalName);
    setStartMonth(originalStartMonth);
    setError(null);
    setEditorVisible(false);
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BackButton onPress={() => router.back()} label="رجوع" />
        <ScreenTitle title="بيانات العمارة" subtitle="اسم العمارة وبداية تسجيل الاشتراكات" />
        {loading ? (
          <>
            <Skeleton height={theme.sizes.skeletonSmall} />
            <Skeleton height={theme.sizes.skeletonSmall} />
          </>
        ) : (
          <>
            <Card variant="surface">
              <Text style={styles.label}>اسم العمارة</Text>
              <Text style={styles.value}>{buildingName || 'لم يُحدد بعد'}</Text>
            </Card>
            <Card variant="surface">
              <Text style={styles.label}>بداية تسجيل الاشتراكات</Text>
              <Text style={styles.value}>{getMonthLabel(startMonth)}</Text>
            </Card>
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <BigButton
          title="تعديل بيانات العمارة"
          onPress={() => setEditorVisible(true)}
          disabled={loading || saving}
        />
      </ScrollView>
      <AppBottomSheet
        visible={editorVisible}
        title="تعديل بيانات العمارة"
        snapPoints={['66%', '90%']}
        onClose={cancelEditor}>
        <FormField
          label="اسم العمارة"
          value={buildingName}
          onChangeText={setBuildingName}
          placeholder="اكتب اسم العمارة"
          editable={!loading && !saving}
        />
        <Text style={styles.label}>بداية تسجيل الاشتراكات</Text>
        <MonthPicker month={startMonth} onChange={setStartMonth} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <BigButton
          title="حفظ البيانات"
          loading={saving}
          onPress={() => void save()}
          disabled={loading}
        />
        <BigButton
          title="إلغاء"
          variant="secondary"
          disabled={saving}
          onPress={cancelEditor}
        />
      </AppBottomSheet>
      <ConfirmDialog
        visible={confirmVisible}
        title="تأكيد حفظ البيانات"
        message="هل تريد حفظ التغييرات على بيانات العمارة؟"
        onConfirm={() => void save(true)}
        onCancel={() => setConfirmVisible(false)}
      />
      <SuccessSheet
        visible={successVisible}
        message="تم حفظ بيانات العمارة."
        onDismiss={() => setSuccessVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: theme.spacingScale.screen,
    paddingTop: theme.spacingScale.md,
    gap: theme.spacingScale.sm,
    backgroundColor: theme.colors.background,
    writingDirection: 'rtl',
  },
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
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'right',
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
});
