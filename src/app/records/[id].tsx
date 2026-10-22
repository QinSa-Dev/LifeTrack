import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, EmptyState, Header, Screen, TextField } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventRecord } from '@/domain/models';
import { localDateText, localTimeText, parseLocalDateTime } from '@/features/common/datetime';
import { formatFullTime, formatRecordValue, isBackfilled, sourceLabel } from '@/features/records/format';
import { EventRecordRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.item}>
      <AppText variant="caption" color={palette.textMuted}>
        {label}
      </AppText>
      <AppText variant={mono ? 'mono' : 'body'}>{value}</AppText>
    </View>
  );
}

/**
 * 单条记录的详情页：时间轴上点一行就到这里。
 *
 * 它的定位是「这条记录的一切都在这一页」：看（快照、取值、时间、来源、备注），
 * 以及改与删（页面底部的「更多操作」里：修改 / 删除 / 撤销删除）。行内右侧因此
 * 只剩取值与【+1】，而【+1】点下去就记，不再弹任何确认——**记错了到这里来改**。
 *
 * 页面里的名称、单位、取值全部来自**记录的快照**，不读定义：定义后来改名、换单位、
 * 归档甚至被永久删除，这一页显示的都还是记录当时的样子（见领域规则「历史不可篡改」）。
 */
export default function RecordDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useReadyDatabase();

  // undefined = 加载中，null = 未找到
  const [record, setRecord] = useState<EventRecord | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 「更多」菜单里的修改：就地展开一张表单，改完再收起
  const [editing, setEditing] = useState(false);
  const [valueText, setValueText] = useState('1');
  const [noteText, setNoteText] = useState('');
  const [dateText, setDateText] = useState('');
  const [timeText, setTimeText] = useState('');

  const load = useCallback(() => {
    let cancelled = false;
    const run = async () => {
      const loaded = await new EventRecordRepository(db).getById(id);
      if (cancelled) {
        return;
      }
      setRecord(loaded);
    };
    run().catch((cause: unknown) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setRecord(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [db, id]);

  useEffect(() => load(), [load]);

  /** 用当前记录填充修改表单（不改记录本身，只改表单里的草稿）。 */
  const startEdit = () => {
    if (!record) {
      return;
    }
    const occurred = new Date(record.occurredAt);
    setValueText(String(record.value));
    setNoteText(record.note ?? '');
    setDateText(localDateText(occurred));
    setTimeText(localTimeText(occurred));
    setError(null);
    setFlash(null);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!record) {
      return;
    }
    const value = Number(valueText.trim());
    if (!Number.isFinite(value)) {
      setError('取值要填一个数字。');
      return;
    }
    const occurredAt = parseLocalDateTime(dateText, timeText);
    if (occurredAt === null) {
      setError('日期或时间格式不正确，日期应形如 2026-10-19，时间应形如 08:30。');
      return;
    }
    setBusy(true);
    setError(null);
    setFlash(null);
    new EventRecordRepository(db)
      .update(record.id, { value, occurredAt, note: noteText })
      .then(() => {
        setEditing(false);
        setFlash('已保存修改');
        load();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  /** 软删除：这一步可撤销（回收站里也能恢复）。 */
  const remove = () => {
    setBusy(true);
    setError(null);
    setFlash(null);
    new EventRecordRepository(db)
      .softDelete(id)
      .then(() => {
        setEditing(false);
        setFlash('已删除，可以撤销');
        load();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const undoRemove = () => {
    setBusy(true);
    setError(null);
    setFlash(null);
    new EventRecordRepository(db)
      .restore(id)
      .then(() => {
        setFlash('已撤销删除，这条记录又回来了');
        load();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  if (record === undefined) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator color={palette.primary} />
      </Screen>
    );
  }

  if (record === null) {
    return (
      <Screen scroll contentStyle={styles.content}>
        <Header title="记录" onBack={() => router.back()} />
        <EmptyState
          title="找不到这条记录"
          description="它可能已经被永久删除。"
          footnote={error ?? undefined}
        />
      </Screen>
    );
  }

  const deleted = record.deletedAt !== undefined;
  const valueLabel =
    record.kind === 'counter' ? '数量（增量）' : `数量${record.unit ? `（${record.unit}）` : ''}`;

  return (
    <Screen scroll contentStyle={styles.content}>
      <Header title={record.snapshot.name} onBack={() => router.back()} />

      {error ? (
        <Card title="操作失败" style={styles.spaced}>
          <AppText variant="body" color={palette.danger}>
            {error}
          </AppText>
        </Card>
      ) : null}

      {flash && !error ? (
        <Card style={styles.spaced}>
          <AppText variant="body" color={palette.success}>
            {flash}
          </AppText>
        </Card>
      ) : null}

      {deleted ? (
        <Card title="这条记录已删除" style={styles.spaced}>
          <View style={styles.badges}>
            <Badge label="已删除" tone="warning" />
            <Badge label="在回收站里" />
          </View>
          <AppText variant="body" color={palette.textMuted}>
            它已经进了回收站，在那里可以恢复，也可以永久删除；也可以在下面的「更多操作」里撤销删除，立刻找回。
          </AppText>
        </Card>
      ) : null}

      {editing ? (
        <Card
          title="修改这条记录"
          subtitle="改的是记录本身；记录时的名称与单位是快照，不会跟着变"
          style={styles.spaced}
        >
          <TextField
            label={valueLabel}
            value={valueText}
            onChangeText={setValueText}
            keyboardType={record.kind === 'counter' ? 'number-pad' : 'decimal-pad'}
          />
          <TextField
            label="备注（可选）"
            value={noteText}
            onChangeText={setNoteText}
            placeholder="例如：运动后"
            multiline
          />
          <View style={styles.editRow}>
            <TextField
              label="发生日期"
              value={dateText}
              onChangeText={setDateText}
              placeholder="2026-10-19"
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={styles.editField}
            />
            <TextField
              label="发生时间"
              value={timeText}
              onChangeText={setTimeText}
              placeholder="08:30"
              autoCapitalize="none"
              autoCorrect={false}
              hint="不能晚于录入时间"
              containerStyle={styles.editField}
            />
          </View>
          <Button
            label={busy ? '保存中…' : '保存修改'}
            onPress={saveEdit}
            disabled={busy}
            style={styles.spacedTop}
          />
          <Button label="取消" tone="secondary" onPress={() => setEditing(false)} disabled={busy} />
        </Card>
      ) : null}

      <Card title="这条记录" subtitle="记录当时的样子，之后改定义也不会动它" style={styles.spaced}>
        <DetailItem label="事件（记录时的名称）" value={record.snapshot.name} />
        <DetailItem label="取值" value={formatRecordValue(record)} />
        <DetailItem label="发生时间" value={formatFullTime(record.occurredAt)} />
        <DetailItem label="录入时间" value={formatFullTime(record.recordedAt)} />
        <DetailItem
          label="来源"
          value={
            isBackfilled(record) ? `${sourceLabel(record.source)}（事后补记的）` : sourceLabel(record.source)
          }
        />
        <DetailItem label="备注" value={record.note ?? '（没有备注）'} />
        <DetailItem label="记录 id" value={record.id} mono />
      </Card>

      {/*
        「更多操作」：低频操作收在一处，页面主体留给「看清楚这条记录」。
        为什么不放右上角的下拉菜单：这个 App 现阶段跑在 Expo Go 里，Expo Go 的开发菜单
        浮球正好压住屏幕右上角——实测点那个位置会打开 Expo Go 自己的面板。放到底部既躲开了它，
        也让删除这类低频操作离阅读位置远一点。
      */}
      <Card
        title="更多操作"
        subtitle={deleted ? '这条记录已删除。' : '记错了可以改；删掉的话能在回收站里找回。'}
        style={styles.spaced}
      >
        {deleted ? (
          <Button
            label={busy ? '撤销中…' : '撤销删除'}
            onPress={undoRemove}
            disabled={busy}
            style={styles.spacedTop}
          />
        ) : (
          <>
            <Button label="修改这条记录" tone="secondary" onPress={startEdit} disabled={busy} />
            <Button
              label={busy ? '删除中…' : '删除这条记录'}
              tone="danger"
              onPress={remove}
              disabled={busy}
              style={styles.spacedTop}
            />
          </>
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
  item: {
    marginBottom: spacing.md,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  editRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editField: {
    flex: 1,
  },
});
