import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, EmptyState, Header, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { LedgerEntry } from '@/domain/models';
import { useGoBack } from '@/features/common/useGoBack';
import { LedgerEntryForm, type LedgerEntryFormValues } from '@/features/ledger/LedgerEntryForm';
import { formatLedgerAmount } from '@/features/ledger/format';
import { formatFullTime } from '@/features/records/format';
import { LedgerEntryRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.item}>
      <AppText variant="caption" color={palette.textMuted}>
        {label}
      </AppText>
      <AppText variant="body">{value}</AppText>
    </View>
  );
}

/**
 * 单条记账的详情页：记账列表里点一行就到这里。
 *
 * 这一页的职责是「看清楚 + 改一改」：金额、方向、发生时间、备注、标签、录入时间
 * 都在同一张卡里；点「编辑这笔账」打开与「记一笔」共用的底部表单（预填原值），
 * 保存后原地刷新。发生时间与录入时间不参与编辑——改金额或备注不该顺手改掉时间。
 *
 * 删除仍留在列表的右滑操作里：这里是从列表进来的，回去就能删。
 */
export default function LedgerDetailScreen() {
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useReadyDatabase();

  // undefined = 加载中，null = 未找到
  const [entry, setEntry] = useState<LedgerEntry | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    const run = async () => {
      const loaded = await new LedgerEntryRepository(db).getById(id);
      if (!cancelled) {
        setEntry(loaded);
      }
    };
    run().catch((cause: unknown) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setEntry(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [db, id]);

  useEffect(() => load(), [load]);

  const startEdit = () => {
    setError(null);
    setFlash(null);
    setEditing(true);
  };

  /**
   * 保存修改。失败时把异常抛回表单——表单会留在打开状态并显示错误，
   * 页面上的旧详情不会被清掉。
   */
  const saveEdit = async (values: LedgerEntryFormValues) => {
    if (!entry) {
      return;
    }
    const updated = await new LedgerEntryRepository(db).update(entry.id, values);
    setEntry(updated);
    setEditing(false);
    setFlash('已保存修改');
  };

  if (entry === undefined) {
    return (
      <Screen contentStyle={styles.centered}>
        <ActivityIndicator color={palette.primary} />
      </Screen>
    );
  }

  if (entry === null) {
    return (
      <Screen scroll contentStyle={styles.content} header={<Header title="记账详情" onBack={goBack} />}>
        <EmptyState title="找不到这笔账" description="它可能已经被删除。" footnote={error ?? undefined} />
      </Screen>
    );
  }

  const amount = formatLedgerAmount(entry.kind, entry.amountCents);
  const amountColor = entry.kind === 'expense' ? palette.danger : palette.success;
  const tag = entry.tag?.trim();

  return (
    <Screen scroll contentStyle={styles.content} header={<Header title="记账详情" onBack={goBack} />}>
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

      <Card style={styles.spaced}>
        <View style={styles.amountRow}>
          <AppText variant="display" color={amountColor}>
            {amount}
          </AppText>
          <Badge
            label={entry.kind === 'expense' ? '支出' : '收入'}
            tone={entry.kind === 'expense' ? 'danger' : 'success'}
          />
        </View>

        <DetailItem label="发生时间" value={formatFullTime(entry.occurredAt)} />
        {tag ? (
          <View style={styles.item}>
            <AppText variant="caption" color={palette.textMuted}>
              标签
            </AppText>
            <Badge label={tag} tone="primary" />
          </View>
        ) : null}
        <DetailItem label="备注" value={entry.note ?? '（没有备注）'} />
        <DetailItem label="录入时间" value={formatFullTime(entry.recordedAt)} />
      </Card>

      <Button label="编辑这笔账" onPress={startEdit} style={styles.spacedTop} />

      {editing ? (
        <LedgerEntryForm
          title="编辑这笔账"
          submitLabel="保存"
          initialValues={{
            kind: entry.kind,
            amountCents: entry.amountCents,
            note: entry.note,
            tag: entry.tag,
          }}
          onSubmit={saveEdit}
          onClose={() => setEditing(false)}
        />
      ) : null}
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
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  item: {
    marginBottom: spacing.md,
  },
});
