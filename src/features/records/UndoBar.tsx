import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card } from '@/components';
import { spacing } from '@/theme';

export interface UndoBarProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  busy?: boolean;
}

/**
 * 软删除后的「撤销」提示条。
 *
 * 因为删除是**软删除**（可恢复），这里不需要 `Alert` 二次确认——
 * 先删、再给一个反悔入口，是比「弹窗确认」更轻的交互。
 * 真正不可恢复的永久删除才需要二次确认（见领域规则）。
 */
export function UndoBar({ message, onUndo, onDismiss, busy = false }: UndoBarProps) {
  return (
    <Card style={styles.card}>
      <AppText variant="body">{message}</AppText>
      <View style={styles.actions}>
        <Button label={busy ? '撤销中…' : '撤销'} onPress={onUndo} disabled={busy} style={styles.grow} />
        <Button label="知道了" tone="secondary" onPress={onDismiss} disabled={busy} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  grow: {
    flex: 1,
  },
});
