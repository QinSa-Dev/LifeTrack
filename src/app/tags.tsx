import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Header, ListRow, Screen, TextField } from '@/components';
import { useReadyDatabase } from '@/db';
import type { Tag } from '@/domain/models';
import { TagRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

export default function TagsScreen() {
  const router = useRouter();
  const { db } = useReadyDatabase();

  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    new TagRepository(db)
      .list()
      .then((loaded) => {
        if (!cancelled) {
          setTags(loaded);
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
    new TagRepository(db)
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

  const confirmRemove = (tag: Tag) => {
    Alert.alert('删除标签', `删除「${tag.name}」会解除它与所有事件定义的关联，但不会删除事件定义本身。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          new TagRepository(db)
            .remove(tag.id)
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
      <Header title="标签管理" onBack={() => router.back()} />

      <Card title="新增标签">
        <TextField
          label="标签名称"
          value={name}
          onChangeText={setName}
          placeholder="例如：早晨 / 运动后"
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

      <Card title="全部标签" subtitle={`${tags.length} 个`} style={styles.spaced}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : tags.length === 0 ? (
          <EmptyState title="还没有标签" description="在上方输入名称即可创建第一个标签。" />
        ) : (
          tags.map((tag) => (
            <ListRow
              key={tag.id}
              title={tag.name}
              right={
                <Button label="删除" tone="danger" onPress={() => confirmRemove(tag)} disabled={busy} />
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