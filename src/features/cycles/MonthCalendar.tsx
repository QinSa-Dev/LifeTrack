import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components';
import { isDateWithin } from '@/domain/dates';
import type { IsoDate } from '@/domain/models';
import {
  describeCalendarDay,
  WEEKDAY_LABELS,
  type DayMark,
  type MonthCalendarCell,
} from '@/features/cycles/calendar';
import { palette, radius, spacing } from '@/theme';

export interface MonthCalendarProps {
  /** 月份标题，例如「2026 年 10 月」 */
  label: string;
  /** `buildMonthGrid` 的结果：7 的整数倍，空 `date` 表示补白 */
  cells: readonly MonthCalendarCell[];
  /** 每天的标记（有记录 / 症状个数） */
  marks: ReadonlyMap<IsoDate, DayMark>;
  startDate: IsoDate;
  endDate?: IsoDate;
  today: IsoDate;
  /** 表单里当前选中的那天，会高亮 */
  selectedDate?: string;
  onSelectDate: (date: IsoDate) => void;
  onShiftMonth: (offset: number) => void;
  canShiftBack: boolean;
  canShiftForward: boolean;
}

function chunkWeeks(cells: readonly MonthCalendarCell[]): MonthCalendarCell[][] {
  const weeks: MonthCalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/**
 * 周期月视图（纯展示）：点某一天就把那天填进表单。
 *
 * 三件事刻意交给调用方：**算格子**（`buildMonthGrid`）、**算标记**（`indexEntriesByDate`）、
 * **选中哪一天**（表单的日期）。这个组件只负责摆出来，所以它没有状态、也没有副作用。
 *
 * 区间之外的日子是**灰的、点不动**：那时仓储也会拒绝保存，不如一开始就不给点。
 */
export function MonthCalendar({
  label,
  cells,
  marks,
  startDate,
  endDate,
  today,
  selectedDate,
  onSelectDate,
  onShiftMonth,
  canShiftBack,
  canShiftForward,
}: MonthCalendarProps) {
  return (
    <View>
      <View style={styles.header}>
        <Button
          label="‹ 上个月"
          tone="secondary"
          size="sm"
          onPress={() => onShiftMonth(-1)}
          disabled={!canShiftBack}
        />
        <AppText variant="subtitle">{label}</AppText>
        <Button
          label="下个月 ›"
          tone="secondary"
          size="sm"
          onPress={() => onShiftMonth(1)}
          disabled={!canShiftForward}
        />
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((weekday) => (
          <AppText
            key={weekday}
            variant="caption"
            color={palette.textMuted}
            style={[styles.cell, styles.weekday]}
          >
            {weekday}
          </AppText>
        ))}
      </View>

      {chunkWeeks(cells).map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((cell, dayIndex) => {
            if (cell.date === undefined) {
              return <View key={`blank-${weekIndex}-${dayIndex}`} style={styles.cell} />;
            }

            const date = cell.date;
            const inRange = isDateWithin(date, startDate, endDate);
            const mark = marks.get(date);
            const selected = selectedDate === date;
            const isToday = date === today;

            return (
              <Pressable
                key={date}
                accessible
                accessibilityRole="button"
                accessibilityState={{ disabled: !inRange, selected }}
                accessibilityLabel={describeCalendarDay(date, mark, { inRange, isToday })}
                disabled={!inRange}
                onPress={() => onSelectDate(date)}
                style={({ pressed }) => [
                  styles.cell,
                  styles.day,
                  mark?.hasEntry ? styles.dayWithEntry : null,
                  isToday ? styles.dayToday : null,
                  selected ? styles.daySelected : null,
                  !inRange ? styles.dayOutside : null,
                  pressed && inRange ? styles.pressed : null,
                ]}
              >
                <AppText
                  variant="caption"
                  color={!inRange ? palette.textMuted : mark?.hasEntry ? palette.primary : palette.text}
                >
                  {Number(date.slice(8))}
                </AppText>
                {inRange && mark?.hasEntry ? (
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: mark.symptomCount > 0 ? palette.danger : palette.primary },
                    ]}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      <AppText variant="caption" color={palette.textMuted} style={styles.legend}>
        涂底色 = 有记录；圆点 = 记了症状；点一天填进下方表单。
      </AppText>
    </View>
  );
}

const CELL_SIZE = 42;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  weekRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekday: {
    height: 'auto',
  },
  day: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayWithEntry: {
    backgroundColor: palette.primarySoft,
  },
  dayToday: {
    borderColor: palette.textMuted,
  },
  // 选中样式放在「今天」之后：同一天又选中时，选中的边框说了算
  daySelected: {
    borderColor: palette.primary,
    borderWidth: 2,
  },
  dayOutside: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radius.pill,
    marginTop: 2,
  },
  legend: {
    marginTop: spacing.sm,
  },
});
