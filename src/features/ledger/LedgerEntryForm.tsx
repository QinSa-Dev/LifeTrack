import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, TextField } from '@/components';
import type { LedgerKind } from '@/domain/models';
import { parseAmountToCents, sanitizeAmountInput } from '@/domain/money';
import { MAX_LEDGER_TAG_LENGTH } from '@/domain/validation';
import { palette, radius, spacing } from '@/theme';

export interface LedgerEntryFormValues {
  kind: LedgerKind;
  amountCents: number;
  note?: string;
  tag?: string;
}

export interface LedgerEntryFormProps {
  onSubmit: (values: LedgerEntryFormValues) => Promise<void>;
  onClose: () => void;
}

/**
 * 「记一笔」的底部表单：方向 + 金额 + 备注 + 标签。
 *
 * 只负责收集与本地格式检查；金额范围、备注 / 标签长度、发生时间这些规则
 * 由仓储层再用同一套校验过一遍。金额输入用数字键盘，输入框本身会清掉
 * 粘贴进来的非数字字符，免得「看得见却怎么都保存不了」。
 */
export function LedgerEntryForm({ onSubmit, onClose }: LedgerEntryFormProps) {
  const [kind, setKind] = useState<LedgerKind>('expense');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const amountCents = parseAmountToCents(amountText);
    if (amountCents === null || amountCents <= 0) {
      setError('请输入大于 0 的金额');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ kind, amountCents, note, tag });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.sheet}>
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            style={styles.scroll}
          >
            <View style={styles.header}>
              <AppText variant="title">记一笔</AppText>
            </View>

            <View style={styles.kinds}>
              <Chip label="支出" selected={kind === 'expense'} onPress={() => setKind('expense')} />
              <Chip label="收入" selected={kind === 'income'} onPress={() => setKind('income')} />
            </View>

            <TextField
              label="金额"
              value={amountText}
              onChangeText={(text) => {
                setAmountText(sanitizeAmountInput(text));
                setError(null);
              }}
              placeholder="0.00"
              keyboardType="decimal-pad"
              autoFocus
              error={error ?? undefined}
              containerStyle={styles.field}
            />

            <TextField
              label="备注"
              value={note}
              onChangeText={setNote}
              placeholder="上班地铁"
              maxLength={100}
              containerStyle={styles.field}
            />

            <TextField
              label="标签"
              value={tag}
              onChangeText={setTag}
              placeholder="例如 通勤"
              maxLength={MAX_LEDGER_TAG_LENGTH}
              containerStyle={styles.field}
            />
          </ScrollView>

          <View style={styles.actions}>
            <Button label="取消" tone="secondary" onPress={onClose} disabled={saving} style={styles.grow} />
            <Button
              label={saving ? '保存中…' : '记下'}
              onPress={submit}
              disabled={saving}
              style={styles.grow}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(23, 26, 33, 0.35)',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    // 小屏 + 键盘弹出时，表单内容在 ScrollView 里滚动，操作按钮始终可见。
    maxHeight: '100%',
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    gap: spacing.md,
  },
  field: {
    marginBottom: 0,
  },
  header: {
    alignItems: 'center',
  },
  kinds: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  grow: {
    flex: 1,
  },
});
