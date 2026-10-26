import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, TextField } from '@/components';
import { useReadyDatabase } from '@/db';
import {
  FIELD_KINDS,
  isEnumFieldKind,
  type CycleMode,
  type EventDefinition,
  type EventDefinitionKind,
  type EventGroup,
  type FieldKind,
} from '@/domain/models';
import type { EventDefinitionDraft, FieldInput, QuickOptionInput } from '@/domain/validation';
import { CYCLE_MODE_HINTS, CYCLE_MODE_LABELS } from '@/features/cycles/labels';
import { FIELD_KIND_HINTS, FIELD_KIND_LABELS } from '@/features/definitions/fields';
import { EventGroupRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

/** 可以**新建**的类型：计数与周期。历史里的「数量」型只会在编辑老定义时出现。 */
const KINDS: readonly EventDefinitionKind[] = ['counter', 'cycle'];

const CYCLE_MODES: readonly CycleMode[] = ['auto', 'manual'];

const KIND_LABELS: Record<EventDefinitionKind, string> = {
  counter: '计数（点一次记一次）',
  cycle: '周期（有开始与结束）',
};

/** 表单里快捷选项用字符串暂存取值，提交时才转数字，方便中途留空编辑。 */
interface QuickOptionRow {
  id?: string;
  /** 「属性 + 取值」里的属性；空串表示这一下不带属性 */
  attribute: string;
  valueText: string;
}

/** 表单里自定义字段的编辑行；枚举型的候选值用字符串数组暂存。 */
interface FieldRow {
  id?: string;
  name: string;
  kind: FieldKind;
  options: string[];
}

/** 数字输入框留空表示「不配置」，交给仓储把空串变成 undefined。 */
function parseOptionalInteger(text: string): number | undefined {
  const trimmed = text.trim();
  return trimmed.length === 0 ? undefined : Number(trimmed);
}

export interface EventDefinitionFormProps {
  /** 编辑时传入已存在的定义；新建时为 null */
  initial: EventDefinition | null;
  submitLabel: string;
  /** 校验通过后由调用方决定写库与跳转 */
  onSubmit: (draft: EventDefinitionDraft) => Promise<void>;
}

/**
 * 事件定义表单（新建与编辑共用）。
 *
 * 表单只负责收集与本地校验，真正的写库与导航交给路由页，
 * 因此同一个组件能在 `/events/new` 与 `/events/[id]` 里复用。
 *
 * 两处产品模型体现在这里：
 * - 「周期」是事件的一种类型：选它之后，这一页会自动换成周期需要的字段
 *   （做法 + 周期长度 + 持续天数），而不是跳到另一个「周期定义」表单；
 * - 「属性」是自由文本、**可以写多条**（例如「温水」「500ml」），而快捷选项
 *   就是「属性 + 取值」——属性从上面那份列表里挑，不用重复填一遍。
 */
export function EventDefinitionForm({ initial, submitLabel, onSubmit }: EventDefinitionFormProps) {
  const { db } = useReadyDatabase();

  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<EventDefinitionKind>(initial?.kind ?? 'counter');
  const [attributes, setAttributes] = useState<string[]>(initial?.attributes ?? []);
  const [cycleMode, setCycleMode] = useState<CycleMode>(initial?.cycleMode ?? 'manual');
  const [cycleLength, setCycleLength] = useState(
    initial?.averageCycleLengthDays === undefined ? '' : String(initial.averageCycleLengthDays),
  );
  const [periodLength, setPeriodLength] = useState(
    initial?.averagePeriodLengthDays === undefined ? '' : String(initial.averagePeriodLengthDays),
  );
  const [groupId, setGroupId] = useState<string | undefined>(initial?.groupId);
  const [fields, setFields] = useState<FieldRow[]>(
    [...(initial?.fields ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((field) => ({ id: field.id, name: field.name, kind: field.kind, options: [...field.options] })),
  );
  const [options, setOptions] = useState<QuickOptionRow[]>(
    [...(initial?.quickOptions ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((option) => ({
        id: option.id,
        attribute: option.attribute ?? '',
        valueText: String(option.value),
      })),
  );
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    new EventGroupRepository(db)
      .list()
      .then((loadedGroups) => {
        if (cancelled) {
          return;
        }
        setGroups(loadedGroups);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  /** 属性列表里已填好的名字（去空白、去重）：快捷选项只在这份名单里挑。 */
  const attributeNames = Array.from(
    new Set(attributes.map((text) => text.trim()).filter((text) => text.length > 0)),
  );

  const updateAttribute = (index: number, text: string) => {
    setAttributes((current) => current.map((value, i) => (i === index ? text : value)));
  };

  const addAttribute = () => {
    setAttributes((current) => [...current, '']);
  };

  const removeAttribute = (index: number) => {
    setAttributes((current) => current.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, patch: Partial<QuickOptionRow>) => {
    setOptions((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addOption = () => {
    setOptions((current) => [...current, { attribute: '', valueText: '1' }]);
  };

  const removeOption = (index: number) => {
    setOptions((current) => current.filter((_, i) => i !== index));
  };

  const updateField = (index: number, patch: Partial<FieldRow>) => {
    setFields((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  /** 切到枚举型时若还没候选值，先补一个空行，省得用户还要再点一下「添加候选值」。 */
  const changeFieldKind = (index: number, kind: FieldKind) => {
    setFields((current) =>
      current.map((row, i) => {
        if (i !== index) {
          return row;
        }
        const options = isEnumFieldKind(kind) && row.options.length === 0 ? [''] : row.options;
        return { ...row, kind, options };
      }),
    );
  };

  const addField = () => {
    setFields((current) => [...current, { name: '', kind: 'single', options: [''] }]);
  };

  const removeField = (index: number) => {
    setFields((current) => current.filter((_, i) => i !== index));
  };

  const updateFieldOption = (fieldIndex: number, optionIndex: number, text: string) => {
    setFields((current) =>
      current.map((row, i) =>
        i === fieldIndex
          ? { ...row, options: row.options.map((option, j) => (j === optionIndex ? text : option)) }
          : row,
      ),
    );
  };

  const addFieldOption = (fieldIndex: number) => {
    setFields((current) =>
      current.map((row, i) => (i === fieldIndex ? { ...row, options: [...row.options, ''] } : row)),
    );
  };

  const removeFieldOption = (fieldIndex: number, optionIndex: number) => {
    setFields((current) =>
      current.map((row, i) =>
        i === fieldIndex ? { ...row, options: row.options.filter((_, j) => j !== optionIndex) } : row,
      ),
    );
  };

  const handleSubmit = () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);

    const quickOptions: QuickOptionInput[] = options.map((row, index) => ({
      id: row.id,
      attribute: row.attribute,
      value: Number(row.valueText.trim()),
      sortOrder: index,
    }));

    const fieldInputs: FieldInput[] = fields.map((row, index) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      options: row.options,
      sortOrder: index,
    }));

    // 两种类型各交各的字段：周期型不带快捷选项/属性/自定义字段，计数型不带周期字段。
    const draft: EventDefinitionDraft =
      kind === 'counter'
        ? { name, kind, attributes, fields: fieldInputs, groupId, quickOptions }
        : {
            name,
            kind,
            groupId,
            quickOptions: [],
            cycleMode,
            averageCycleLengthDays: parseOptionalInteger(cycleLength),
            averagePeriodLengthDays: parseOptionalInteger(periodLength),
          };

    onSubmit(draft)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <View>
      <Card title="基本信息">
        <TextField
          label="事件名称"
          value={name}
          onChangeText={setName}
          placeholder="例如：喝水"
          autoFocus={initial === null}
        />

        <AppText variant="label" color={palette.textMuted} style={styles.fieldLabel}>
          类型
        </AppText>
        <View style={styles.chipRow}>
          {KINDS.map((item) => (
            <Chip
              key={item}
              label={KIND_LABELS[item]}
              selected={kind === item}
              onPress={() => setKind(item)}
            />
          ))}
        </View>

        {kind === 'cycle' ? (
          <>
            <AppText variant="label" color={palette.textMuted} style={styles.spacedTop}>
              周期方式
            </AppText>
            <View style={styles.chipRow}>
              {CYCLE_MODES.map((item) => (
                <Chip
                  key={item}
                  label={CYCLE_MODE_LABELS[item]}
                  selected={cycleMode === item}
                  onPress={() => setCycleMode(item)}
                />
              ))}
            </View>
            <AppText variant="caption" color={palette.textMuted} style={styles.hint}>
              {CYCLE_MODE_HINTS[cycleMode]}
            </AppText>

            <TextField
              label={cycleMode === 'auto' ? '周期长度（天）：每隔多少天一次' : '平均周期长度（天，可选）'}
              value={cycleLength}
              onChangeText={setCycleLength}
              placeholder="例如：28"
              keyboardType="number-pad"
              hint={
                cycleMode === 'auto'
                  ? '自动循环按它推算下一段的开始日。'
                  : '两个周期开始日之间的平均天数，用来预测下次开始日。'
              }
            />
            <TextField
              label="一段通常持续多少天（可选）"
              value={periodLength}
              onChangeText={setPeriodLength}
              placeholder="例如：5"
              keyboardType="number-pad"
              hint={cycleMode === 'auto' ? '自动生成时会按它一并给出结束日。' : '只作参考，不限定真实时长。'}
            />
          </>
        ) : null}
      </Card>

      {kind === 'counter' ? (
        <Card title="属性" style={styles.spaced}>
          {attributes.length === 0 ? (
            <AppText variant="caption" color={palette.textMuted}>
              例如「200ml」（不写也行）
            </AppText>
          ) : (
            attributes.map((text, index) => (
              <View key={index} style={styles.attributeRow}>
                <TextField
                  label={`属性 ${index + 1}`}
                  value={text}
                  onChangeText={(next) => updateAttribute(index, next)}
                  placeholder="例如：200ml"
                  containerStyle={styles.attributeField}
                />
                <Button label="移除" tone="danger" size="sm" onPress={() => removeAttribute(index)} />
              </View>
            ))
          )}
          <Button label="+ 添加属性" tone="secondary" onPress={addAttribute} style={styles.spacedTop} />
        </Card>
      ) : null}

      <Card title="分组" subtitle="分组用于归类；删除分组不会删除事件" style={styles.spaced}>
        <View style={styles.chipRow}>
          <Chip label="未分组" selected={groupId === undefined} onPress={() => setGroupId(undefined)} />
          {groups.map((group) => (
            <Chip
              key={group.id}
              label={group.name}
              selected={groupId === group.id}
              color={group.color ?? palette.primary}
              onPress={() => setGroupId(group.id)}
            />
          ))}
        </View>
        {groups.length === 0 ? (
          <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
            还没有分组，可在「事件」页的「分组」里添加。
          </AppText>
        ) : null}
      </Card>

      {kind === 'counter' ? (
        <Card
          title="自定义字段"
          subtitle="给这个事件定义带类型的输入项；记录时逐个选值"
          style={styles.spaced}
        >
          {fields.length === 0 ? (
            <AppText variant="caption" color={palette.textMuted}>
              还没有字段。例如「时段」（单选：早晨/中午/晚上）、「心情」（多选）、「起床时间」（时间点）。
            </AppText>
          ) : (
            fields.map((row, index) => (
              <View key={row.id ?? index} style={styles.option}>
                <TextField
                  label={`字段 ${index + 1} 名称`}
                  value={row.name}
                  onChangeText={(text) => updateField(index, { name: text })}
                  placeholder="例如：时段"
                />
                <AppText variant="label" color={palette.textMuted} style={styles.fieldLabel}>
                  类型
                </AppText>
                <View style={styles.chipRow}>
                  {FIELD_KINDS.map((item) => (
                    <Chip
                      key={item}
                      label={FIELD_KIND_LABELS[item]}
                      selected={row.kind === item}
                      onPress={() => changeFieldKind(index, item)}
                    />
                  ))}
                </View>
                <AppText variant="caption" color={palette.textMuted} style={styles.hint}>
                  {FIELD_KIND_HINTS[row.kind]}
                </AppText>

                {isEnumFieldKind(row.kind) ? (
                  <>
                    <AppText variant="label" color={palette.textMuted} style={styles.fieldLabel}>
                      候选值
                    </AppText>
                    {row.options.map((option, optionIndex) => (
                      <View key={optionIndex} style={styles.attributeRow}>
                        <TextField
                          label={`候选值 ${optionIndex + 1}`}
                          value={option}
                          onChangeText={(text) => updateFieldOption(index, optionIndex, text)}
                          placeholder="例如：早晨"
                          containerStyle={styles.attributeField}
                        />
                        <Button
                          label="移除"
                          tone="danger"
                          size="sm"
                          onPress={() => removeFieldOption(index, optionIndex)}
                        />
                      </View>
                    ))}
                    <Button
                      label="+ 添加候选值"
                      tone="secondary"
                      onPress={() => addFieldOption(index)}
                      style={styles.spacedTop}
                    />
                  </>
                ) : null}

                <Button
                  label="移除该字段"
                  tone="danger"
                  onPress={() => removeField(index)}
                  style={styles.spacedTop}
                />
              </View>
            ))
          )}
          <Button label="+ 添加字段" tone="secondary" onPress={addField} style={styles.spacedTop} />
        </Card>
      ) : null}

      {kind === 'counter' ? (
        <Card title="快捷选项" subtitle="一键记录「属性 + 取值」" style={styles.spaced}>
          {options.length === 0 ? (
            <AppText variant="caption" color={palette.textMuted}>
              还没有快捷选项。添加后，记录页上会多出一排一点就记的胶囊。
            </AppText>
          ) : (
            options.map((row, index) => (
              <View key={row.id ?? index} style={styles.option}>
                {attributeNames.length > 0 ? (
                  <>
                    <AppText variant="label" color={palette.textMuted} style={styles.fieldLabel}>
                      属性
                    </AppText>
                    <View style={styles.chipRow}>
                      <Chip
                        label="不填属性"
                        selected={row.attribute === ''}
                        onPress={() => updateOption(index, { attribute: '' })}
                      />
                      {attributeNames.map((attribute) => (
                        <Chip
                          key={attribute}
                          label={attribute}
                          selected={row.attribute === attribute}
                          onPress={() => updateOption(index, { attribute })}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
                <TextField
                  label="取值"
                  value={row.valueText}
                  onChangeText={(text) => updateOption(index, { valueText: text })}
                  keyboardType="number-pad"
                />
                <Button label="移除该选项" tone="danger" onPress={() => removeOption(index)} />
              </View>
            ))
          )}
          <Button label="+ 添加快捷选项" tone="secondary" onPress={addOption} style={styles.spacedTop} />
        </Card>
      ) : null}

      {error ? (
        <AppText variant="body" color={palette.danger} style={styles.spaced}>
          {error}
        </AppText>
      ) : null}

      <Button
        label={saving ? '保存中…' : submitLabel}
        onPress={handleSubmit}
        disabled={saving}
        style={styles.spaced}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  spaced: {
    marginTop: spacing.md,
  },
  spacedTop: {
    marginTop: spacing.md,
  },
  fieldLabel: {
    marginBottom: spacing.sm,
  },
  hint: {
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  attributeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  attributeField: {
    flex: 1,
    marginBottom: 0,
  },
  option: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
});
