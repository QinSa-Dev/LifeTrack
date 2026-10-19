import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Header,
  ListRow,
  Screen,
  TextField,
} from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventDefinition, EventRecord, RecordSource } from '@/domain/models';
import { formatOccurredAt, formatRecordValue, sourceLabel } from '@/features/records/format';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  const save = (value: number, unit: string | undefined, source: RecordSource) => {
    if (!definition || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    new EventRecordRepository(db)
      .record({ definitionId: definition.id, value, unit, note, source })
      .then((created) => {
        setFlash(`已记录：${created.snapshot.name} ${formatRecordValue(created)}`);
        setNote('');
        load();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
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
                onPress={() => save(option.value, option.unit, 'quick')}
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
          <Button
            label={busy ? '记录中…' : '记录'}
            onPress={() => save(Number(manualValue.trim()), undefined, 'manual')}
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
            <ListRow
              key={record.id}
              title={formatOccurredAt(record.occurredAt)}
              subtitle={
                record.note ? `${sourceLabel(record.source)} · ${record.note}` : sourceLabel(record.source)
              }
              right={
                <>
                  {record.occurredAt !== record.recordedAt ? <Badge label="补录" tone="warning" /> : null}
                  <AppText variant="subtitle">{formatRecordValue(record)}</AppText>
                </>
              }
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
  },
});
