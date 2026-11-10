import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { listApartments, type Apartment } from '@/db/apartments';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { theme } from '@/theme';
import { arabicErrorMessage } from '@/services/errors';

export default function ChooseApartmentScreen() {
  const router = useRouter();
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setApartments(await listApartments());
      setError(null);
    } catch (loadError) {
      setError(arabicErrorMessage(loadError, 'تعذر تحميل الشقق.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const visible = apartments.filter((apartment) =>
    `${apartment.number} ${apartment.owner_name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <FlatList
      style={styles.list}
      data={loading ? [] : visible}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.content}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      ListHeaderComponent={
        <View style={styles.header}>
          <ScreenHeader title="اختر الشقة" subtitle="حدد الشقة لتسجيل دفعة" />
          <FormField label="بحث" value={search} onChangeText={setSearch} placeholder="رقم الشقة أو اسم المالك" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? <><Skeleton /><Skeleton /></> : null}
        </View>
      }
      ListEmptyComponent={loading ? undefined : <EmptyState message="لا توجد شقق تطابق البحث." />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/payment', params: { apartmentId: String(item.id) } })}>
          <Card style={styles.row}>
            <Text style={styles.number}>شقة {item.number}</Text>
            <Text style={styles.owner}>{item.owner_name || 'اسم المالك غير مسجل'}</Text>
          </Card>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: theme.colors.background },
  content: { flexGrow: 1, padding: theme.spacingScale.screen, gap: theme.spacingScale.xs, paddingBottom: theme.spacingScale.lg },
  header: { gap: theme.spacingScale.xs, marginBottom: theme.spacingScale.xs },
  row: { minHeight: theme.sizes.rowLarge, justifyContent: 'center' },
  number: { color: theme.colors.text, fontSize: theme.typography.section, fontFamily: theme.typography.bold, textAlign: 'right' },
  owner: { color: theme.colors.secondaryText, fontSize: theme.typography.body, fontFamily: theme.typography.fontFamily, textAlign: 'right' },
  error: { color: theme.colors.danger, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'right' },
});
