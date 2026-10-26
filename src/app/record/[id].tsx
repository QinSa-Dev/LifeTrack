import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, EmptyState, Header, Screen, TextField } from '@/components';
import { useReadyDatabase } from '@/db';
import {
  attributeText,
  recordAttributes,
  type EventDefinition,
  type EventRecord,
  type RecordSource,
} from '@/domain/models';
import { localDateText, localTimeText, parseLocalDateTime, shiftLocalDays } from '@/features/common/datetime';
import { FieldValuePicker } from '@/features/records/FieldValuePicker';
import { describeRecord, formatOccurredAt, sourceLabel } from '@/features/records/format';
import { RecordRow } from '@/features/records/RecordRow';
import { EventDefinitionRepository, EventRecordRepository } from '@/repositories';
import type { FieldValueInput } from '@/domain/validation';
import { palette, radius, spacing } from '@/theme';

const RECENT_LIMIT = 5;

/** 反馈贴在「刚才点的那个地方」：快捷胶囊 / 手动按钮 / 最近记录，三处各一片。 */
type FlashScope = 'quick' | 'manual' | 'recent';

/**
 * 一次操作的结果。
 *
 * 存在的理由：原来成功提示是一张卡片、渲染在页面最顶端，而「手动记录」的按钮在
 * 页面底部——记完看不到任何变化，会以为没记上。所以提示必须落在操作点附近，
 * 成功失败也走同一套（错误同样可能出现在页面底部）。
 */
interface Flash {
  text: string;
  tone: 'success' | 'danger';
  scope: FlashScope;
}

export default function RecordScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useReadyDatabase();

  // undefined = 加载中，null = 未找到
  const [definition, setDefinition] = useState<EventDefinition | null | undefined>(undefined);
  const [recent, setRecent] = useState<EventRecord[]>([]);
  const [manualValue, setManualValue] = useState('1');
  // 这一次要标上的属性（可多选）。默认一个都不选：用户明确说了「默认不选」。
  const [attributes, setAttributes] = useState<string[]>([]);
  // 这一次各自定义字段的取值；按字段 id 存，没选到的字段自然缺省为空。
  const [fieldValues, setFieldValues] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState('');
  // 补录：开启后填写过去的日期与时间
  const [backfill, setBackfill] = useState(false);
  const [dateText, setDateText] = useState(() => localDateText(new Date()));
  const [timeText, setTimeText] = useState(() => localTimeText(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  // 「最近记录」里正在【+1】的那一条
  const [repeatingId, setRepeatingId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    Promise.all([
      new EventDefinitionRepository(db).getById(id),
      new EventRecordRepository(db).list({ definitionId: id, limit: RECENT_LIMIT }),
    ])
      .then(([loadedDefinition, loadedRecords]) => {
        if (cancelled) {
          return;
        }
        setDefinition(loadedDefinition);
        setRecent(loadedRecords);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setDefinition(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db, id]);

  useEffect(() => load(), [load]);

  /** 当前表单里非空的字段取值；仓储会再按定义逐条校验（空值直接不提交）。 */
  const selectedFieldValues = (): FieldValueInput[] =>
    (definition?.fields ?? [])
      .map((field) => ({ fieldId: field.id, values: fieldValues[field.id] ?? [] }))
      .filter((entry) => entry.values.some((value) => value.trim().length > 0));

  /**
   * 记一条。
   *
   * `note` 默认取输入框里的备注；行内的【+1】显式传空串——它不该顺手带上
   * 你刚敲进「手动记录」输入框、还没提交的备注。
   * `fieldValues` 同理：手动记录用当前选择，快捷记录与【+1】各自显式传值。
   * `scope` 决定成功/失败提示贴在哪张卡里（见 `Flash`），默认贴在手动记录。
   */
  const save = (
    value: number,
    usedAttributes: string[],
    source: RecordSource,
    options: {
      occurredAt?: string;
      note?: string;
      fieldValues?: FieldValueInput[];
      scope?: FlashScope;
    } = {},
  ): Promise<void> => {
    if (!definition || busy) {
      return Promise.resolve();
    }
    const scope = options.scope ?? 'manual';
    const usedNote = options.note ?? note;
    setBusy(true);
    setFlash(null);
    return new EventRecordRepository(db)
      .record({
        definitionId: definition.id,
        value,
        attributes: usedAttributes,
        fieldValues: options.fieldValues ?? selectedFieldValues(),
        note: usedNote,
        source,
        occurredAt: options.occurredAt,
      })
      .then((created) => {
        setFlash({
          text: `${created.source === 'backfill' ? '已补录' : '已记录'}：${describeRecord(created)}`,
          tone: 'success',
          scope,
        });
        if (usedNote.trim() !== '') {
          setNote('');
        }
        load();
      })
      .catch((cause: unknown) => {
        setFlash({
          text: cause instanceof Error ? cause.message : String(cause),
          tone: 'danger',
          scope,
        });
      })
      .finally(() => {
        setBusy(false);
      });
  };

  /** 行内【+1】：以这条记录的取值再记一条（不带备注）。 */
  const repeatRecord = (record: EventRecord) => {
    if (repeatingId !== null) {
      return;
    }
    setRepeatingId(record.id);
    void save(record.value, recordAttributes(record), 'quick', {
      note: '',
      fieldValues: record.fieldValues,
      scope: 'recent',
    }).finally(() => setRepeatingId(null));
  };

  const toggleAttribute = (attribute: string) => {
    setAttributes((current) =>
      current.includes(attribute) ? current.filter((item) => item !== attribute) : [...current, attribute],
    );
  };

  const setFieldValue = (fieldId: string, values: string[]) => {
    setFieldValues((current) => ({ ...current, [fieldId]: values }));
  };

  const submitManual = () => {
    if (!definition) {
      return;
    }
    if (!backfill) {
      void save(Number(manualValue.trim()), attributes, 'manual');
      return;
    }
    const occurredAt = parseLocalDateTime(dateText, timeText);
    if (occurredAt === null) {
      // 提示同样贴在按钮旁边——校验失败时人在页面底部，看不到顶端那张错误卡
      setFlash({
        text: '日期或时间格式不正确，日期应形如 2026-10-19，时间应形如 08:30。',
        tone: 'danger',
        scope: 'manual',
      });
      return;
    }
    void save(Number(manualValue.trim()), attributes, 'backfill', { occurredAt });
  };

  if (definition === undefined) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator color={palette.primary} />
      </Screen>
    );
  }

  if (definition === null) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <Header title="记录" onBack={() => router.back()} />
        <EmptyState title="找不到这个事件" description="它可能已经被删除。" footnote={error ?? undefined} />
      </Screen>
    );
  }

  const archived = definition.isArchived;
  const selectedAttributeText = attributeText(attributes);

  /** 把一次操作的反馈贴在指定那张卡里（见 `Flash`）；不匹配就是什么都不渲染。 */
  const flashFor = (scope: FlashScope) => {
    if (flash === null || flash.scope !== scope) {
      return null;
    }
    const success = flash.tone === 'success';
    return (
      <View style={[styles.flash, { backgroundColor: success ? palette.successSoft : palette.dangerSoft }]}>
        <AppText variant="label" color={success ? palette.success : palette.danger}>
          {success ? `✓ ${flash.text}` : flash.text}
        </AppText>
      </View>
    );
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <Header
        title={definition.name}
        onBack={() => router.back()}
        right={
          <Button
            label="编辑定义"
            tone="secondary"
            onPress={() => router.push({ pathname: '/events/[id]', params: { id: definition.id } })}
          />
        }
      />

      {definition.kind === 'cycle' ? (
        <Card title="这是周期型事件" style={styles.spaced}>
          <AppText variant="body" color={palette.textMuted}>
            周期型事件不点一次记一次，而是在它的详情页里开一段周期、逐天记录。
          </AppText>
          <Button
            label="去周期页面"
            onPress={() => router.replace({ pathname: '/cycles/[id]', params: { id: definition.id } })}
            style={styles.spacedTop}
          />
        </Card>
      ) : null}

      {archived ? (
        <Card title="已归档" style={styles.spaced}>
          <AppText variant="body" color={palette.warning}>
            这个事件已归档，不能再新增记录。历史记录不受影响；如需继续记录，请先取消归档。
          </AppText>
        </Card>
      ) : null}

      {error ? (
        <Card style={styles.spaced}>
          <AppText variant="body" color={palette.danger}>
            {error}
          </AppText>
        </Card>
      ) : null}

      {!archived && definition.kind === 'counter' && definition.quickOptions.length > 0 ? (
        <Card title="快捷记录" subtitle="点一下即可记录（属性 + 取值）" style={styles.spaced}>
          <View style={styles.chipRow}>
            {definition.quickOptions.map((option) => (
              <Chip
                key={option.id}
                label={option.attribute ? `${option.attribute}（+${option.value}）` : `+${option.value}`}
                onPress={() =>
                  void save(option.value, option.attribute ? [option.attribute] : [], 'quick', {
                    fieldValues: [],
                    scope: 'quick',
                  })
                }
              />
            ))}
          </View>
          {flashFor('quick')}
        </Card>
      ) : null}

      {!archived && definition.kind === 'counter' ? (
        <Card title="手动记录" subtitle="记录本次的增量（正整数）" style={styles.spaced}>
          {definition.fields.length > 0 ? (
            <>
              <AppText variant="label" color={palette.textMuted} style={styles.fieldLabel}>
                字段（记录本次选的值）
              </AppText>
              {definition.fields.map((field) => (
                <FieldValuePicker
                  key={field.id}
                  field={field}
                  values={fieldValues[field.id] ?? []}
                  onChange={(values) => setFieldValue(field.id, values)}
                />
              ))}
            </>
          ) : null}
          {definition.attributes.length > 0 ? (
            <>
              <AppText variant="label" color={palette.textMuted} style={styles.fieldLabel}>
                属性（可多选，不选就只记数量）
              </AppText>
              <View style={styles.chipRow}>
                {definition.attributes.map((attribute) => (
                  <Chip
                    key={attribute}
                    label={attribute}
                    selected={attributes.includes(attribute)}
                    onPress={() => toggleAttribute(attribute)}
                  />
                ))}
              </View>
            </>
          ) : null}
          <TextField
            label={selectedAttributeText === undefined ? '数量' : `数量（${selectedAttributeText}）`}
            value={manualValue}
            onChangeText={setManualValue}
            keyboardType="number-pad"
          />
          <TextField
            label="备注（可选）"
            value={note}
            onChangeText={setNote}
            placeholder="例如：运动后"
            multiline
          />

          <View style={styles.toggleRow}>
            <Chip label="补录时间" selected={backfill} onPress={() => setBackfill((value) => !value)} />
            <AppText variant="caption" color={palette.textMuted} style={styles.toggleHint}>
              开启后可填写过去发生的时间
            </AppText>
          </View>

          {backfill ? (
            <View>
              <View style={styles.chipRow}>
                <Chip label="今天" onPress={() => setDateText(localDateText(new Date()))} />
                <Chip
                  label="昨天"
                  onPress={() => setDateText(localDateText(shiftLocalDays(new Date(), -1)))}
                />
                <Chip
                  label="前天"
                  onPress={() => setDateText(localDateText(shiftLocalDays(new Date(), -2)))}
                />
              </View>
              <TextField
                label="日期"
                value={dateText}
                onChangeText={setDateText}
                placeholder="2026-10-19"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextField
                label="时间"
                value={timeText}
                onChangeText={setTimeText}
                placeholder="08:30"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : null}

          <Button
            label={busy ? '处理中…' : backfill ? '补录' : '记录'}
            onPress={submitManual}
            disabled={busy}
          />
          {flashFor('manual')}
        </Card>
      ) : null}

      <Card title="最近记录" subtitle={`该事件最近 ${recent.length} 条`} style={styles.spaced}>
        {flashFor('recent')}
        {recent.length === 0 ? (
          <AppText variant="caption" color={palette.textMuted}>
            还没有记录。
          </AppText>
        ) : (
          recent.map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              title={formatOccurredAt(record.occurredAt)}
              subtitle={
                record.note ? `${sourceLabel(record.source)} · ${record.note}` : sourceLabel(record.source)
              }
              onPress={() => router.push({ pathname: '/records/[id]', params: { id: record.id } })}
              onRepeat={() => repeatRecord(record)}
              repeating={repeatingId === record.id}
              repeatBlockedReason={archived ? '已归档' : undefined}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.md,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spaced: {
    marginTop: spacing.md,
  },
  spacedTop: {
    marginTop: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    marginBottom: spacing.sm,
  },
  /** 操作反馈条：贴在按钮/胶囊下面，绿底=成功、红底=失败 */
  flash: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  toggleHint: {
    flexShrink: 1,
  },
});
