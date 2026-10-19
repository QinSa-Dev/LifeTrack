import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppText, Button, Card, TextField } from '@/components';
import type { CycleDefinition } from '@/domain/models';
import type { CycleDefinitionInput } from '@/domain/validation';
import { palette, spacing } from '@/theme';

/** 数字输入框留空表示「不配置」，交给仓储把空串变成 undefined。 */
function parseOptionalInteger(text: string): number | undefined {
  const trimmed = text.trim();
  return trimmed.length === 0 ? undefined : Number(trimmed);
}

export interface CycleDefinitionFormProps {
  /** 编辑时传入已存在的定义；新建时为 null */
  initial: CycleDefinition | null;
  submitLabel: string;
  /** 校验通过后由调用方决定写库与跳转 */
  onSubmit: (input: CycleDefinitionInput) => Promise<void>;
}

/**
 * 周期定义表单（新建与编辑共用）。
 *
 * 与 `EventDefinitionForm` 一样，表单只收集与提交，写库与导航由路由页负责，
 * 因此同一个组件能在 `/cycles/new` 与 `/cycles/[id]` 里复用。
 */
export function CycleDefinitionForm({ initial, submitLabel, onSubmit }: CycleDefinitionFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [cycleLength, setCycleLength] = useState(
    initial?.averageCycleLengthDays === undefined ? '' : String(initial.averageCycleLengthDays),
  );
  const [periodLength, setPeriodLength] = useState(
    initial?.averagePeriodLengthDays === undefined ? '' : String(initial.averagePeriodLengthDays),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);

    onSubmit({
      name,
      averageCycleLengthDays: parseOptionalInteger(cycleLength),
      averagePeriodLengthDays: parseOptionalInteger(periodLength),
    })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <Card title="周期定义" subtitle="预测只依据「平均周期长度」，留空则不做预测">
      <TextField
        label="名称"
        value={name}
        onChangeText={setName}
        placeholder="例如：生理期"
        autoFocus={initial === null}
      />

      <TextField
        label="平均周期长度（天，可选）"
        value={cycleLength}
        onChangeText={setCycleLength}
        placeholder="例如：28"
        keyboardType="number-pad"
        hint="两个周期开始日之间的平均天数，用来预测下次开始日。"
      />

      <TextField
        label="平均经期长度（天，可选）"
        value={periodLength}
        onChangeText={setPeriodLength}
        placeholder="例如：5"
        keyboardType="number-pad"
      />

      {error ? (
        <AppText variant="body" color={palette.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <Button label={saving ? '保存中…' : submitLabel} onPress={handleSubmit} disabled={saving} />
    </Card>
  );
}

const styles = StyleSheet.create({
  error: {
    marginBottom: spacing.md,
  },
});
