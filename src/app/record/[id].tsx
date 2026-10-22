import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, EmptyState, Header, Screen, TextField } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventDefinition, EventRecord, RecordSource } from '@/domain/models';
import { localDateText, localTimeText, parseLocalDateTime, shiftLocalDays } from '@/features/common/datetime';
import { describeRecord, formatOccurredAt, sourceLabel } from '@/features/records/format';
import { RecordRow } from '@/features/records/RecordRow';
import { EventDefinitionRepository, EventRecordRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

const RECENT_LIMIT = 5;

export default function RecordScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useReadyDatabase();

  // undefined = 加载中，null = 未找到
  const [definition, setDefinition] = useState<EventDefinition | null | undefined>(undefined);
  const [recent, setRecent] = useState<EventRecord[]>([]);
  const [manualValue, setManualValue] = useState('1');
  const [note, setNote] = useState('');
  // 补录：开启后填写过去的日期与时间
  const [backfill, setBackfill] = useState(false);
  const [dateText, setDateText] = useState(() => localDateText(new Date()));
  const [timeText, setTimeText] = useState(() => localTimeText(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
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

  /**
   * 记一条。
   *
   * `note` 默认取输入框里的备注；行内的【+1】显式传空串——它不该顺手带上
   * 你刚敲进「手动记录」输入框、还没提交的备注。
   */
  const save = (
    value: number,
    unit: string | undefined,
    source: RecordSource,
    options: { occurredAt?: string; note?: string } = {},
  ): Promise<void> => {
    if (!definition || busy) {
      return Promise.resolve();
    }
    const usedNote = options.note ?? note;
    setBusy(true);
    setError(null);
    setFlash(null);
    return new EventRecordRepository(db)
      .record({
        definitionId: definition.id,
        value,
        unit,
        note: usedNote,
        source,
        occurredAt: options.occurredAt,
      })
      .then((created) => {
        setFlash(`${created.source === 'backfill' ? '已补录' : '已记录'}：${describeRecord(created)}`);
        if (usedNote.trim() !== '') {
          setNote('');
        }
        load();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
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
    void save(record.value, record.unit, 'quick', { note: '' }).finally(() => setRepeatingId(null));
  };

  const submitManual = () => {
    if (!definition) {
      return;
    }
    if (!backfill) {
      void save(Number(manualValue.trim()), undefined, 'manual');
      return;
    }
    const occurredAt = parseLocalDateTime(dateText, timeText);
    if (occurredAt === null) {
      setError('日期或时间格式不正确，日期应形如 2026-10-19，时间应形如 08:30。');
      return;
    }
    void save(Number(manualValue.trim()), undefined, 'backfill', { occurredAt });
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

      {archived ? (
        <Card title="已归档" style={styles.spaced}>
          <AppText variant="body" color={palette.warning}>
            这个事件已归档，不能再新增记录。历史记录不受影响；如需继续记录，请先取消归档。
          </AppText>
        </Card>
      ) : null}

      {flash ? (
        <Card style={styles.spaced}>
          <AppText variant="body" color={palette.success}>
            {flash}
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

      {!archived && definition.quickOptions.length > 0 ? (
        <Card title="快捷记录" subtitle="点一下即可记录" style={styles.spaced}>
          <View style={styles.chipRow}>
            {definition.quickOptions.map((option) => (
              <Chip
                key={option.id}
                label={`${option.label}（+${option.value}${option.unit ?? definition.unit ?? ''}）`}
                onPress={() => void save(option.value, option.unit, 'quick')}
              />
            ))}
          </View>
        </Card>
      ) : null}

      {!archived ? (
        <Card
          title="手动记录"
          subtitle={definition.kind === 'counter' ? '记录本次增量（正整数）' : '记录本次数量'}
          style={styles.spaced}
        >
          <TextField
            label={
              definition.kind === 'counter'
                ? '数量'
                : `数量${definition.unit ? `（${definition.unit}）` : ''}`
            }
            value={manualValue}
            onChangeText={setManualValue}
            keyboardType={definition.kind === 'counter' ? 'number-pad' : 'decimal-pad'}
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
        </Card>
      ) : null}

      <Card title="最近记录" subtitle={`该事件最近 ${recent.length} 条`} style={styles.spaced}>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
