import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Header, ListRow, Screen, TextField } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventGroup } from '@/domain/models';
import { EventGroupRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

export default function GroupsScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    new EventGroupRepository(db)
      .list()
      .then((loaded) => {
        if (!cancelled) {
          setGroups(loaded);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useFocusEffect(load);

  const add = () => {
    if (busy || name.trim().length === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    new EventGroupRepository(db)
      .create({ name })
      .then(() => {
        setName('');
        load();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const confirmRemove = (group: EventGroup) => {
    Alert.alert('删除分组', `删除「${group.name}」不会删除任何事件定义，只会把它们移到「未分组」。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          new EventGroupRepository(db)
            .remove(group.id)
            .then(() => load())
            .catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : String(cause));
            })
            .finally(() => {
              setBusy(false);
            });
        },
      },
    ]);
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <Header title="分组管理" onBack={() => router.back()} />

      <Card title="新增分组">
        <TextField
          label="分组名称"
          value={name}
          onChangeText={setName}
          placeholder="例如：健康 / 工作"
          onSubmitEditing={add}
          returnKeyType="done"
        />
        <Button label="添加" onPress={add} disabled={busy || name.trim().length === 0} />
      </Card>

      {error ? (
        <AppText variant="body" color={palette.danger} style={styles.spaced}>
          {error}
        </AppText>
      ) : null}

      <Card title="全部分组" subtitle={`${groups.length} 个`} style={styles.spaced}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : groups.length === 0 ? (
          <EmptyState title="还没有分组" description="在上方输入名称即可创建第一个分组。" />
        ) : (
          groups.map((group) => (
            <ListRow
              key={group.id}
              title={group.name}
              right={
                <Button
                  label="删除"
                  tone="danger"
                  onPress={() => confirmRemove(group)}
                  disabled={busy}
                />
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
  spaced: {
    marginTop: spacing.md,
  },
  loading: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
});