import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  addApartment,
  listApartments,
  softDeleteApartment,
  updateApartment,
  type Apartment,
} from '@/db/apartments';
import { BigButton } from '@/components/ui/BigButton';
import { BackButton } from '@/components/ui/BackButton';
import { AnimatedListItem } from '@/components/ui/AnimatedListItem';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenTitle } from '@/components/ui/ScreenTitle';
import { SuccessSheet } from '@/components/ui/SuccessSheet';
import { theme } from '@/components/ui/theme';
import { arabicErrorMessage } from '@/services/errors';

export default function ApartmentsScreen() {
  const router = useRouter();
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<Apartment | null>(null);
  const [number, setNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<Apartment | null>(null);
  const [confirmSaveVisible, setConfirmSaveVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApartments(await listApartments());
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل الشقق. حاول مرة أخرى.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const openNew = () => {
    setEditing(null);
    setNumber('');
    setOwnerName('');
    setEditorVisible(true);
  };

  const openEdit = (apartment: Apartment) => {
    setEditing(apartment);
    setNumber(apartment.number);
    setOwnerName(apartment.owner_name);
    setEditorVisible(true);
  };

  const save = async (confirmed = false) => {
    const trimmedNumber = number.trim();
    if (!trimmedNumber) {
      setError('اكتب رقم الشقة أولاً.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const allApartments = await listApartments(true);
      if (allApartments.some((item) => item.number === trimmedNumber && item.id !== editing?.id)) {
        setError('رقم الشقة مستخدم من قبل. اكتب رقماً آخر.');
        setConfirmSaveVisible(false);
        return;
      }
      if (editing && !confirmed) {
        setConfirmSaveVisible(true);
        return;
      }
      if (editing) {
        await updateApartment(editing.id, {
          number: trimmedNumber,
          owner_name: ownerName,
          active: 1,
        });
      } else {
        await addApartment(trimmedNumber, ownerName);
      }
      setConfirmSaveVisible(false);
      setEditorVisible(false);
      await load();
      setSuccessVisible(true);
    } catch (saveError) {
      setError(arabicErrorMessage(saveError, 'تعذر حفظ الشقة. تحقق من البيانات وحاول مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!pendingDeactivate) return;
    try {
      await softDeleteApartment(pendingDeactivate.id);
      setPendingDeactivate(null);
      await load();
    } catch (deleteError) {
      setError(arabicErrorMessage(deleteError, 'تعذر إيقاف الشقة. حاول مرة أخرى.'));
      setPendingDeactivate(null);
    }
  };

  const visibleApartments = apartments.filter((apartment) => {
    const query = search.trim().toLocaleLowerCase();
    return (
      !query
      || apartment.number.toLocaleLowerCase().includes(query)
      || apartment.owner_name.toLocaleLowerCase().includes(query)
    );
  });

  return (
    <>
      <FlatList
        style={styles.list}
        data={loading ? [] : visibleApartments}
        keyExtractor={(apartment) => String(apartment.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <BackButton onPress={() => router.back()} label="رجوع" />
            <ScreenTitle title="الشقق" subtitle="إضافة وتعديل بيانات الشقق" />
            <FormField
              label="بحث برقم الشقة أو اسم المالك"
              value={search}
              onChangeText={setSearch}
              placeholder="اكتب للبحث"
              autoCorrect={false}
            />
            <BigButton title="إضافة شقة" onPress={openNew} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading ? (
              <View style={styles.skeletonList}>
                <Skeleton height={theme.sizes.regularCardHeight} />
                <Skeleton height={theme.sizes.regularCardHeight} />
                <Skeleton height={theme.sizes.regularCardHeight} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              message={search ? 'لا توجد شقق تطابق البحث.' : 'لا توجد شقق بعد. أضف أول شقة.'}
            />
          ) : undefined
        }
        renderItem={({ item: apartment, index }) => {
          const row = (
            <Card>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({
                  pathname: '/apartment-account/[id]',
                  params: { id: String(apartment.id) },
                })}
                style={styles.apartmentRow}>
                <View style={styles.apartmentAvatar}>
                  <Text style={styles.apartmentAvatarText}>{apartment.number}</Text>
                </View>
                <View style={styles.apartmentCopy}>
                  <Text style={styles.owner}>{apartment.owner_name || 'اسم المالك غير مسجل'}</Text>
                </View>
              </Pressable>
              <View style={styles.actions}>
                <Pressable onPress={() => openEdit(apartment)} style={styles.actionButton}>
                  <Text style={styles.actionText}>تعديل</Text>
                </Pressable>
                <Pressable onPress={() => setPendingDeactivate(apartment)} style={styles.actionButton}>
                  <Text style={styles.deleteText}>إيقاف الشقة</Text>
                </Pressable>
              </View>
            </Card>
          );
          return index < 10
            ? <AnimatedListItem index={index}>{row}</AnimatedListItem>
            : row;
        }}
      />

      <AppBottomSheet
        visible={editorVisible}
        title={editing ? 'تعديل الشقة' : 'إضافة شقة'}
        snapPoints={['52%']}
        onClose={() => setEditorVisible(false)}>
        <FormField label="رقم الشقة" value={number} onChangeText={setNumber} />
        <FormField
          label="اسم المالك"
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder="اختياري"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <BigButton
          title={editing ? 'تأكيد الحفظ' : 'حفظ الشقة'}
          loading={saving}
          onPress={() => void save()}
        />
        <BigButton title="إلغاء" variant="secondary" onPress={() => setEditorVisible(false)} />
      </AppBottomSheet>

      <ConfirmDialog
        visible={confirmSaveVisible}
        title="حفظ التعديلات"
        message="هل تريد حفظ التغييرات على بيانات هذه الشقة؟"
        confirmDisabled={saving}
        onConfirm={() => void save(true)}
        onCancel={() => setConfirmSaveVisible(false)}
      />

      <SuccessSheet
        visible={successVisible}
        message="تم حفظ بيانات الشقة."
        onDismiss={() => setSuccessVisible(false)}
      />

      <ConfirmDialog
        visible={pendingDeactivate !== null}
        title="إيقاف الشقة"
        message={`هل تريد إيقاف الشقة ${pendingDeactivate?.number ?? ''}؟ ستبقى بياناتها السابقة محفوظة.`}
        confirmLabel="نعم، أوقفها"
        destructive
        onConfirm={() => void deactivate()}
        onCancel={() => setPendingDeactivate(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: theme.spacingScale.screen,
    paddingTop: theme.spacingScale.md,
    paddingBottom: theme.spacingScale.lg,
    gap: theme.spacingScale.sm,
    backgroundColor: theme.colors.background,
    writingDirection: 'rtl',
  },
  list: { flex: 1, backgroundColor: theme.colors.background },
  listHeader: { gap: theme.spacingScale.sm, marginBottom: theme.spacingScale.sm },
  skeletonList: { gap: theme.spacingScale.sm },
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
  apartmentRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacingScale.sm },
  apartmentAvatar: {
    minWidth: theme.sizes.avatar,
    height: theme.sizes.avatar,
    paddingHorizontal: theme.spacingScale.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.successBackground,
  },
  apartmentAvatarText: { color: theme.colors.primary, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  apartmentCopy: { flex: 1, justifyContent: 'center' },
  owner: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacingScale.xs,
    justifyContent: 'flex-start',
  },
  actionButton: {
    minHeight: theme.sizes.touchCompact,
    minWidth: theme.sizes.apartmentActionWidth,
    alignItems: 'center',
    justifyContent: 'center',
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
  error: {
    color: theme.colors.danger,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
});
