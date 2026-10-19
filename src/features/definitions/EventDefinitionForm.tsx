import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, TextField } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventDefinition, EventDefinitionKind, EventGroup, Tag } from '@/domain/models';
import type { EventDefinitionDraft, QuickOptionInput } from '@/domain/validation';
import { EventGroupRepository, TagRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

const KINDS: readonly EventDefinitionKind[] = ['counter', 'quantity'];

/** 表单里快捷选项用字符串暂存取值，提交时才转数字，方便中途留空编辑。 */
interface QuickOptionRow {
  id?: string;
  label: string;
  valueText: string;
  unit: string;
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
 */
export function EventDefinitionForm({ initial, submitLabel, onSubmit }: EventDefinitionFormProps) {
  const { db } = useReadyDatabase();

  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<EventDefinitionKind>(initial?.kind ?? 'counter');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [groupId, setGroupId] = useState<string | undefined>(initial?.groupId);
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [options, setOptions] = useState<QuickOptionRow[]>(
    [...(initial?.quickOptions ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((option) => ({
        id: option.id,
        label: option.label,
        valueText: String(option.value),
        unit: option.unit ?? '',
      })),
  );
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([new EventGroupRepository(db).list(), new TagRepository(db).list()])
      .then(([loadedGroups, loadedTags]) => {
        if (cancelled) {
          return;
        }
        setGroups(loadedGroups);
        setTags(loadedTags);
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

  const toggleTag = (id: string) => {
    setTagIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const updateOption = (index: number, patch: Partial<QuickOptionRow>) => {
    setOptions((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addOption = () => {
    setOptions((current) => [...current, { label: '', valueText: '1', unit: '' }]);
  };

  const removeOption = (index: number) => {
    setOptions((current) => current.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);

    const quickOptions: QuickOptionInput[] = options.map((row, index) => ({
      id: row.id,
      label: row.label,
      value: Number(row.valueText.trim()),
      unit: row.unit,
      sortOrder: index,
    }));

    const draft: EventDefinitionDraft = { name, kind, unit, groupId, tagIds, quickOptions };

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
              label={item === 'counter' ? '计数（+1）' : '数量（记多少）'}
              selected={kind === item}
              onPress={() => setKind(item)}
            />
          ))}
        </View>

        <TextField
          label="单位（可选）"
          value={unit}
          onChangeText={setUnit}
          placeholder={kind === 'quantity' ? '例如：杯 / 公里' : '例如：次'}
          containerStyle={styles.spacedTop}
        />
      </Card>

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

      <Card title="标签" subtitle="可多选；标签只是标注，不影响历史" style={styles.spaced}>
        {tags.length === 0 ? (
          <AppText variant="caption" color={palette.textMuted}>
            还没有标签，可在「事件」页的「标签」里添加。
          </AppText>
        ) : (
          <View style={styles.chipRow}>
            {tags.map((tag) => (
              <Chip
                key={tag.id}
                label={tag.name}
                selected={tagIds.includes(tag.id)}
                color={tag.color ?? palette.primary}
                onPress={() => toggleTag(tag.id)}
              />
            ))}
          </View>
        )}
      </Card>

      <Card title="快捷选项" subtitle="一键记录常用的取值" style={styles.spaced}>
        {options.length === 0 ? (
          <AppText variant="caption" color={palette.textMuted}>
            还没有快捷选项。添加后，记录时可以一键填入。
          </AppText>
        ) : (
          options.map((row, index) => (
            <View key={row.id ?? index} style={styles.option}>
              <TextField
                label={`选项 ${index + 1} 名称`}
                value={row.label}
                onChangeText={(text) => updateOption(index, { label: text })}
                placeholder="例如：一杯"
              />
              <View style={styles.optionRow}>
                <TextField
                  label="取值"
                  value={row.valueText}
                  onChangeText={(text) => updateOption(index, { valueText: text })}
                  keyboardType="decimal-pad"
                  containerStyle={styles.optionHalf}
                />
                <TextField
                  label="单位（可选）"
                  value={row.unit}
                  onChangeText={(text) => updateOption(index, { unit: text })}
                  placeholder="杯"
                  containerStyle={styles.optionHalf}
                />
              </View>
              <Button label="移除该选项" tone="danger" onPress={() => removeOption(index)} />
            </View>
          ))
        )}
        <Button label="+ 添加快捷选项" tone="secondary" onPress={addOption} style={styles.spacedTop} />
      </Card>

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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  optionHalf: {
    flex: 1,
  },
});