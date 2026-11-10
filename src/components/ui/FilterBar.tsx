import { AppText } from '@/components/ui/AppText';
import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from './AppBottomSheet';
import { FormField } from './FormField';
import { BigButton } from './BigButton';
import { MonthPicker, getCurrentMonth } from './MonthPicker';
import { theme } from '@/theme';

export type FilterStatus = 'all' | 'paid' | 'partial' | 'unpaid';

export interface FilterSortOption {
  value: string;
  label: string;
}

export interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  status?: FilterStatus;
  onStatusChange?: (status: FilterStatus) => void;
  month?: string;
  onMonthChange?: (month: string) => void;
  fromDate?: string;
  toDate?: string;
  onDateRangeChange?: (from: string, to: string) => void;
  sort?: string;
  sortOptions?: FilterSortOption[];
  onSortChange?: (sort: string) => void;
  defaultSort?: string;
  mainFilters?: ReactNode;
  resultCount: number;
  totalCount: number;
  totalAmount: number;
  extraFilters?: ReactNode;
  extraFilterCount?: number;
  onClear: () => void;
}

const STATUSES: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'paid', label: 'دفع' },
  { value: 'partial', label: 'جزئي' },
  { value: 'unpaid', label: 'لم يدفع' },
];

export function FilterBar({
  search,
  onSearchChange,
  searchLabel = 'بحث برقم الشقة أو المالك أو الملاحظة',
  searchPlaceholder = 'اكتب للبحث',
  status,
  onStatusChange,
  month,
  onMonthChange,
  fromDate,
  toDate,
  onDateRangeChange,
  sort,
  sortOptions = [],
  onSortChange,
  defaultSort,
  mainFilters,
  resultCount,
  totalCount,
  totalAmount,
  extraFilters,
  extraFilterCount = 0,
  onClear,
}: FilterBarProps) {
  const [moreVisible, setMoreVisible] = useState(false);
  const initialSort = defaultSort ?? sortOptions[0]?.value;
  const hasMoreFilters = Boolean(
    (month && onMonthChange) || onDateRangeChange || extraFilters || (onSortChange && sortOptions.length > 0),
  );
  const activeCount = useMemo(
    () => Number(Boolean(search.trim())) + Number(Boolean(status && status !== 'all'))
      + extraFilterCount
      + Number(Boolean(fromDate || toDate))
      + Number(Boolean(month && onMonthChange && month !== getCurrentMonth()))
      + Number(Boolean(sort && initialSort && sort !== initialSort)),
    [extraFilterCount, fromDate, initialSort, month, onMonthChange, search, sort, status, toDate],
  );

  return (
    <View style={styles.container}>
      <FormField
        label={searchLabel}
        value={search}
        onChangeText={onSearchChange}
        placeholder={searchPlaceholder}
        autoCorrect={false}
        icon="search"
      />
      {onStatusChange ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {STATUSES.map((item) => {
            const selected = status === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onStatusChange(item.value)}
                style={[styles.chip, selected && styles.chipSelected]}>
                <AppText style={[styles.chipText, selected && styles.chipTextSelected]}>{item.label}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {mainFilters}
      {hasMoreFilters ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`فلاتر أكثر${activeCount > 0 ? `، ${activeCount} فلاتر نشطة` : ''}`}
          onPress={() => setMoreVisible(true)}
          style={styles.moreButton}>
          <MaterialIcons name="tune" size={theme.sizes.icon} color={theme.colors.primary} />
          <AppText style={styles.actionLabel}>فلاتر أكثر</AppText>
          {activeCount > 0 ? <AppText style={styles.badge}>{activeCount}</AppText> : null}
        </Pressable>
      ) : null}
      <AppText style={styles.summary}>
        عرض {resultCount} من {totalCount} — المجموع {totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج
      </AppText>
      <AppBottomSheet
        visible={moreVisible}
        title="فلاتر أكثر"
        onClose={() => setMoreVisible(false)}>
        {month && onMonthChange ? (
          <View style={styles.filterGroup}>
            <AppText style={styles.groupTitle}>الشهر</AppText>
            <MonthPicker month={month} onChange={onMonthChange} />
          </View>
        ) : null}
        {onDateRangeChange ? (
          <View style={styles.dateRange}>
            <AppText style={styles.groupTitle}>الفترة الزمنية</AppText>
            <FormField
              label="من تاريخ"
              value={fromDate ?? ''}
              onChangeText={(value) => onDateRangeChange(value, toDate ?? '')}
              placeholder="سنة-شهر-يوم"
            />
            <FormField
              label="إلى تاريخ"
              value={toDate ?? ''}
              onChangeText={(value) => onDateRangeChange(fromDate ?? '', value)}
              placeholder="سنة-شهر-يوم"
            />
          </View>
        ) : null}
        {onSortChange && sortOptions.length > 0 ? (
          <View style={styles.filterGroup}>
            <AppText style={styles.groupTitle}>الترتيب</AppText>
            {sortOptions.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: option.value === sort }}
                onPress={() => onSortChange(option.value)}
                style={[styles.sortOption, option.value === sort && styles.sortSelected]}>
                <AppText style={[styles.sortText, option.value === sort && styles.sortTextSelected]}>
                  {option.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
        {extraFilters}
        <BigButton title="تطبيق" onPress={() => setMoreVisible(false)} />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClear();
            setMoreVisible(false);
          }}>
          <AppText style={styles.clearLink}>مسح الكل</AppText>
        </Pressable>
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacingScale.sm },
  chips: { gap: theme.spacingScale.xs, paddingVertical: theme.spacingScale.xs },
  chip: {
    minHeight: theme.sizes.touch,
    minWidth: theme.sizes.filterChipMinWidth,
    paddingHorizontal: theme.spacingScale.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { color: theme.colors.text, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  chipTextSelected: { color: theme.colors.onPrimary },
  moreButton: { minHeight: theme.sizes.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: theme.spacingScale.xs, paddingHorizontal: theme.spacingScale.xs, borderRadius: theme.radii.sm, backgroundColor: theme.colors.successBackground },
  filterGroup: { gap: theme.spacingScale.xs },
  groupTitle: { width: '100%', color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'auto', writingDirection: 'rtl' },
  badge: {
    minWidth: theme.sizes.smallBadgeWidth,
    paddingHorizontal: theme.spacingScale.xs,
    borderRadius: theme.radii.pill,
    overflow: 'hidden',
    backgroundColor: theme.colors.warningBackground,
    color: theme.colors.warning,
    fontSize: theme.typography.small,
    fontFamily: theme.typography.bold,
    textAlign: 'center',
  },
  dateRange: { gap: theme.spacingScale.sm },
  actionLabel: { color: theme.colors.primary, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  clearLink: { color: theme.colors.danger, fontSize: theme.typography.body, fontFamily: theme.typography.bold, textAlign: 'center', textDecorationLine: 'underline' },
  summary: { color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.medium, textAlign: 'auto' },
  sortOption: {
    minHeight: theme.sizes.touchCompact + theme.spacingScale.xs / 2,
    paddingHorizontal: theme.spacingScale.sm,
    justifyContent: 'center',
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
  },
  sortSelected: { backgroundColor: theme.colors.paidBackground },
  sortText: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.medium, textAlign: 'auto' },
  sortTextSelected: { color: theme.colors.primary, fontFamily: theme.typography.bold },
});
