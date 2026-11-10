import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppBottomSheet } from './AppBottomSheet';
import { FormField } from './FormField';
import { MonthPicker } from './MonthPicker';
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
  resultCount,
  totalCount,
  totalAmount,
  extraFilters,
  extraFilterCount = 0,
  onClear,
}: FilterBarProps) {
  const [sortVisible, setSortVisible] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const activeCount = useMemo(
    () => Number(Boolean(search.trim())) + Number(Boolean(status && status !== 'all'))
      + extraFilterCount
      + Number(Boolean(fromDate || toDate)),
    [extraFilterCount, fromDate, search, status, toDate],
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
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {month && onMonthChange ? <MonthPicker month={month} onChange={onMonthChange} /> : null}
      {onDateRangeChange ? (
        <>
          <Pressable style={styles.expandButton} onPress={() => setFiltersExpanded((value) => !value)}>
            <MaterialIcons name={filtersExpanded ? 'expand-less' : 'expand-more'} size={24} color={theme.colors.primary} />
            <Text style={styles.actionLabel}>تصفية بالتاريخ</Text>
            {activeCount > 0 ? <Text style={styles.badge}>{activeCount}</Text> : null}
          </Pressable>
          {filtersExpanded ? (
            <View style={styles.dateRange}>
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
        </>
      ) : null}
      {extraFilters}
      <View style={styles.actions}>
        {onSortChange && sortOptions.length > 0 ? (
          <Pressable style={styles.actionButton} onPress={() => setSortVisible(true)}>
            <MaterialIcons name="sort" size={22} color={theme.colors.primary} />
            <Text style={styles.actionLabel}>
              {sortOptions.find((option) => option.value === sort)?.label ?? 'ترتيب'}
            </Text>
          </Pressable>
        ) : null}
        {activeCount > 0 ? (
          <Pressable style={styles.actionButton} onPress={onClear}>
            <MaterialIcons name="filter-alt-off" size={21} color={theme.colors.danger} />
            <Text style={[styles.actionLabel, styles.clearLabel]}>مسح الفلاتر</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.summary}>
        عرض {resultCount} من {totalCount} — المجموع {totalAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج
      </Text>
      <AppBottomSheet
        visible={sortVisible}
        title="ترتيب النتائج"
        snapPoints={['42%']}
        onClose={() => setSortVisible(false)}>
        {sortOptions.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: option.value === sort }}
            onPress={() => {
              onSortChange?.(option.value);
              setSortVisible(false);
            }}
            style={[styles.sortOption, option.value === sort && styles.sortSelected]}>
            <Text style={[styles.sortText, option.value === sort && styles.sortTextSelected]}>{option.label}</Text>
          </Pressable>
        ))}
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
  expandButton: { minHeight: theme.sizes.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: theme.spacingScale.xs },
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
  actions: { flexDirection: 'row', gap: theme.spacingScale.sm, alignItems: 'center' },
  actionButton: { minHeight: theme.sizes.touch, flexDirection: 'row', alignItems: 'center', gap: theme.spacingScale.xs },
  actionLabel: { color: theme.colors.primary, fontSize: theme.typography.small, fontFamily: theme.typography.bold },
  clearLabel: { color: theme.colors.danger },
  summary: { color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.medium, textAlign: 'right' },
  sortOption: {
    minHeight: theme.sizes.touchCompact + theme.spacingScale.xs / 2,
    paddingHorizontal: theme.spacingScale.sm,
    justifyContent: 'center',
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
  },
  sortSelected: { backgroundColor: theme.colors.paidBackground },
  sortText: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.medium, textAlign: 'right' },
  sortTextSelected: { color: theme.colors.primary, fontFamily: theme.typography.bold },
});
