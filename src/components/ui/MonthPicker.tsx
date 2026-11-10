import { AppText } from '@/components/ui/AppText';
import { useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppBottomSheet } from './AppBottomSheet';
import { theme } from './theme';

const MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export function getCurrentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthLabel(month: string): string {
  const [yearText, monthText] = month.split('-');
  const index = Number(monthText) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 11 || !yearText) return month;
  return `${MONTHS[index]} ${yearText}`;
}

function shift(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export interface MonthPickerProps {
  month: string;
  onChange: (month: string) => void;
  minYear?: number;
  maxYear?: number;
}

export function MonthPicker({
  month,
  onChange,
  minYear = 2000,
  maxYear = new Date().getFullYear(),
}: MonthPickerProps) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const nextMonthDisabled = month >= getCurrentMonth();
  const chooseMonth = (monthNumber: number) => {
    onChange(`${year}-${String(monthNumber).padStart(2, '0')}`);
    setPickerVisible(false);
  };

  return (
    <>
      <View style={styles.row}>
        <Pressable
          accessibilityLabel="الشهر السابق"
          accessibilityRole="button"
          onPress={() => onChange(shift(month, -1))}
          style={styles.arrow}>
          <MaterialIcons name="chevron-right" size={theme.sizes.iconLarge} color={theme.colors.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="اختيار شهر آخر"
          onPress={() => {
            setYear(Number(month.slice(0, 4)));
            setPickerVisible(true);
          }}
          style={styles.monthButton}>
          <AppText style={styles.label}>{getMonthLabel(month)}</AppText>
        </Pressable>
        <Pressable
          accessibilityLabel="الشهر التالي"
          accessibilityRole="button"
          accessibilityState={{ disabled: nextMonthDisabled }}
          disabled={nextMonthDisabled}
          onPress={() => onChange(shift(month, 1))}
          style={[styles.arrow, nextMonthDisabled && styles.arrowDisabled]}>
          <MaterialIcons name="chevron-left" size={theme.sizes.iconLarge} color={nextMonthDisabled ? theme.colors.muted : theme.colors.primary} />
        </Pressable>
      </View>
      <AppBottomSheet
        visible={pickerVisible}
        title="اختيار الشهر"
        onClose={() => setPickerVisible(false)}
        snapPoints={['60%']}>
        <View style={styles.yearRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: year <= minYear }}
            disabled={year <= minYear}
            onPress={() => setYear((value) => Math.max(minYear, value - 1))}
            style={[styles.arrow, year <= minYear && styles.arrowDisabled]}>
            <MaterialIcons name="chevron-right" size={theme.sizes.iconLarge} color={year <= minYear ? theme.colors.muted : theme.colors.primary} />
          </Pressable>
          <AppText style={styles.year}>{year}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: year >= maxYear }}
            disabled={year >= maxYear}
            onPress={() => setYear((value) => Math.min(maxYear, value + 1))}
            style={[styles.arrow, year >= maxYear && styles.arrowDisabled]}>
            <MaterialIcons name="chevron-left" size={theme.sizes.iconLarge} color={year >= maxYear ? theme.colors.muted : theme.colors.primary} />
          </Pressable>
        </View>
        <View style={styles.monthGrid}>
          {MONTHS.map((name, index) => {
            const monthNumber = index + 1;
            const selected =
              year === Number(month.slice(0, 4)) && monthNumber === Number(month.slice(5, 7));
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => chooseMonth(monthNumber)}
                style={[styles.monthOption, selected && styles.monthSelected]}>
                <AppText style={[styles.monthText, selected && styles.monthTextSelected]}>{name}</AppText>
              </Pressable>
            );
          })}
        </View>
      </AppBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    direction: 'rtl',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: theme.sizes.touchCompact + theme.spacingScale.xs / 2,
    paddingHorizontal: theme.spacingScale.xs,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.successBackground,
  },
  arrow: {
    minWidth: theme.sizes.avatar,
    minHeight: theme.sizes.touchCompact,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: { opacity: 0.55 },
  monthButton: { flex: 1, minHeight: theme.sizes.touchCompact, alignItems: 'center', justifyContent: 'center' },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'center',
  },
  yearRow: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.sizes.touch,
  },
  year: {
    color: theme.colors.text,
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.extraBold,
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacingScale.xs, justifyContent: 'space-between' },
  monthOption: {
    width: theme.sizes.monthGridCellWidth,
    minHeight: theme.sizes.touch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  monthSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  monthText: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'center',
  },
  monthTextSelected: { color: theme.colors.onPrimary, fontFamily: theme.typography.bold },
});
