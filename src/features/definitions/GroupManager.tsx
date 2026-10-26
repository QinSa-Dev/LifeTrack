import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ListRow, TextField } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventGroup } from '@/domain/models';
import { EventGroupRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

import { renameGroupInput } from './groupInput';

export interface GroupManagerProps {
  /** 当前分组：由页面读好传进来（事件行还要用它显示分组名，不在这里重复读一遍） */
  groups: readonly EventGroup[];
  /** 写库成功后的回调：页面据此重读分组，刷新事件行上的分组名 */
  onChanged: () => void;
}

/**
 * 分组管理卡：新建 / 改名 / 删除，就地放在「事件」页里展开。
 *
 * 分组就是为了给事件归类，改完马上就要看事件分得对不对——做成单独一页要来回跳，
 * 所以收进这里。它只管分组本身；「某个事件属于哪个分组」仍在事件定义表单里选。
 */
export function GroupManager({ groups, onChanged }: GroupManagerProps) {
  const { db } = useReadyDatabase();

  const [name, setName] = useState('');
  // 正在改名的分组 id 与它的草稿；同一时刻只改一个
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (task: () => Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    task()
      .then(onChanged)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const add = () => {
    if (name.trim().length === 0) {
      return;
    }
    const repository = new EventGroupRepository(db);
    run(async () => {
      await repository.create({ name });
      setName('');
    });
  };

  const startEdit = (group: EventGroup) => {
    setEditingId(group.id);
    setDraft(group.name);
  };

  const saveEdit = (group: EventGroup) => {
    if (draft.trim().length === 0) {
      return;
    }
    const repository = new EventGroupRepository(db);
    run(async () => {
      await repository.update(group.id, renameGroupInput(group, draft));
      setEditingId(null);
    });
  };

  const confirmRemove = (group: EventGroup) => {
    Alert.alert('删除分组', `删除「${group.name}」不会删除事件，它们会回到「未分组」。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => run(() => new EventGroupRepository(db).remove(group.id)),
      },
    ]);
  };

  return (
    <Card title="分组" subtitle={`${groups.length} 个`} style={styles.spaced}>
      <View style={styles.row}>
        <TextField
          label="新建分组"
          value={name}
          onChangeText={setName}
          placeholder="例如：健康"
          onSubmitEditing={add}
          returnKeyType="done"
          containerStyle={styles.field}
        />
        <Button label="添加" onPress={add} disabled={busy || name.trim().length === 0} />
      </View>

      {error ? (
        <AppText variant="caption" color={palette.danger} style={styles.spacedTop}>
          {error}
        </AppText>
      ) : null}

      {groups.length === 0 ? (
        <AppText variant="caption" color={palette.textMuted} style={styles.spacedTop}>
          还没有分组，输入名称即可创建
        </AppText>
      ) : (
        groups.map((group) =>
          editingId === group.id ? (
            <View key={group.id} style={[styles.row, styles.editRow]}>
              <TextField
                label="分组名称"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => saveEdit(group)}
                returnKeyType="done"
                autoFocus
                containerStyle={styles.field}
              />
              <Button label="保存" size="sm" onPress={() => saveEdit(group)} disabled={busy} />
              <Button
                label="取消"
                tone="secondary"
                size="sm"
                onPress={() => setEditingId(null)}
                disabled={busy}
              />
            </View>
          ) : (
            <ListRow
              key={group.id}
              title={group.name}
              right={
                <>
                  <Button
                    label="改名"
                    tone="secondary"
                    size="sm"
                    onPress={() => startEdit(group)}
                    disabled={busy}
                  />
                  <Button
                    label="删除"
                    tone="danger"
                    size="sm"
                    onPress={() => confirmRemove(group)}
                    disabled={busy}
                  />
                </>
              }
            />
          ),
        )
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
    marginBottom: 0,
  },
  editRow: {
    paddingVertical: spacing.sm,
  },
  spaced: {
    marginTop: spacing.md,
  },
  spacedTop: {
    marginTop: spacing.sm,
  },
});
