import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Header, Screen } from '@/components';
import { useReadyDatabase } from '@/db';
import type { EventDefinition } from '@/domain/models';
import { EventDefinitionForm } from '@/features/definitions/EventDefinitionForm';
import { EventDefinitionRepository } from '@/repositories';
import { palette, spacing } from '@/theme';

export default function EditEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useReadyDatabase();

  // undefined = 加载中，null = 未找到
  const [definition, setDefinition] = useState<EventDefinition | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    new EventDefinitionRepository(db)
      .getById(id)
      .then((loaded) => {
        if (!cancelled) {
          setDefinition(loaded);
        }
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

  // 挂载与 id 变化时读取一次
  useEffect(() => reload(), [reload]);

  const toggleArchive = () => {
    if (!definition || busy) {
      return;
    }
    const next = !definition.isArchived;
    setBusy(true);
    setError(null);
    new EventDefinitionRepository(db)
      .setArchived(definition.id, next)
      .then(() => {
        setDefinition({ ...definition, isArchived: next });
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const confirmDelete = () => {
    if (!definition || busy) {
      return;
    }
    Alert.alert(
      '永久删除事件定义',
      `「${definition.name}」将被永久删除，其快捷选项与标签关联会一并清理。此操作不可撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '永久删除',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            setError(null);
            new EventDefinitionRepository(db)
              .remove(definition.id)
              .then(() => router.back())
              .catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : String(cause));
                setBusy(false);
              });
          },
        },
      ],
    );
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
        <Header title="编辑事件" onBack={() => router.back()} />
        <EmptyState title="找不到这个事件" description="它可能已经被删除。" footnote={error ?? undefined} />
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <Header
        title="编辑事件"
        onBack={() => router.back()}
        right={
          definition.isArchived ? (
            <AppText variant="label" color={palette.warning}>
              已归档
            </AppText>
          ) : undefined
        }
      />

      <EventDefinitionForm
        initial={definition}
        submitLabel="保存修改"
        onSubmit={async (draft) => {
          await new EventDefinitionRepository(db).update(definition.id, draft);
          router.back();
        }}
      />

      {error ? (
        <AppText variant="body" color={palette.danger} style={styles.spaced}>
          {error}
        </AppText>
      ) : null}

      <Card title="状态与删除" subtitle="归档可随时取消；永久删除需二次确认" style={styles.spaced}>
        <View style={styles.actions}>
          <Button
            label={definition.isArchived ? '取消归档' : '归档'}
            tone="secondary"
            onPress={toggleArchive}
            disabled={busy}
            style={styles.grow}
          />
          <Button
            label="永久删除"
            tone="danger"
            onPress={confirmDelete}
            disabled={busy}
            style={styles.grow}
          />
        </View>
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
});
