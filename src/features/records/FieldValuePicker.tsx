import { StyleSheet, View } from 'react-native';

import { AppText, Chip, TextField } from '@/components';
import { isEnumFieldKind, type DefinitionField } from '@/domain/models';
import { palette, spacing } from '@/theme';

export interface FieldValuePickerProps {
  field: DefinitionField;
  /** 这一次选的值：单选 ≤1、多选若干、时间点 1 个、时间段 2 个 */
  values: string[];
  onChange: (values: string[]) => void;
}

/**
 * 记录页上一个自定义字段的取值控件。
 *
 * 四种类型各用最顺手的控件：枚举型是可点选胶囊（单选互斥、多选可叠），
 * 时间点是单个输入框，时间段是起止两个输入框。**只负责收集**，
 * 值是否合法交给仓储层统一校验（见 domain/validation）。
 */
export function FieldValuePicker({ field, values, onChange }: FieldValuePickerProps) {
  if (isEnumFieldKind(field.kind)) {
    const toggle = (option: string) => {
      if (field.kind === 'single') {
        onChange(values.includes(option) ? [] : [option]);
        return;
      }
      onChange(values.includes(option) ? values.filter((item) => item !== option) : [...values, option]);
    };
    return (
      <View style={styles.block}>
        <AppText variant="label" color={palette.textMuted} style={styles.label}>
          {field.name}（{field.kind === 'single' ? '单选' : '多选'}）
        </AppText>
        <View style={styles.chipRow}>
          {field.options.map((option) => (
            <Chip
              key={option}
              label={option}
              selected={values.includes(option)}
              onPress={() => toggle(option)}
            />
          ))}
        </View>
      </View>
    );
  }

  if (field.kind === 'time') {
    return (
      <TextField
        label={`${field.name}（时间点）`}
        value={values[0] ?? ''}
        onChangeText={(text) => onChange(text.trim() === '' ? [] : [text])}
        placeholder="08:30"
        autoCapitalize="none"
        autoCorrect={false}
      />
    );
  }

  const start = values[0] ?? '';
  const end = values[1] ?? '';
  const update = (nextStart: string, nextEnd: string) => {
    onChange(nextStart.trim() === '' && nextEnd.trim() === '' ? [] : [nextStart, nextEnd]);
  };
  return (
    <View style={styles.block}>
      <AppText variant="label" color={palette.textMuted} style={styles.label}>
        {field.name}（时间段）
      </AppText>
      <View style={styles.rangeRow}>
        <TextField
          label="开始"
          value={start}
          onChangeText={(text) => update(text, end)}
          placeholder="08:30"
          containerStyle={styles.rangeField}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="结束"
          value={end}
          onChangeText={(text) => update(start, text)}
          placeholder="09:15"
          containerStyle={styles.rangeField}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: spacing.sm,
  },
  label: {
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rangeField: {
    flex: 1,
  },
});
