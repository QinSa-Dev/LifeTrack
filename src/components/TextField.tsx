import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { palette, radius, spacing, typography } from '@/theme';

import { AppText } from './AppText';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** 输入下方的说明文字 */
  hint?: string;
  /** 校验错误；存在时边框变红并优先显示错误 */
  error?: string;
  containerStyle?: ViewStyle;
}

/**
 * 带标签与错误提示的输入框。
 * 这是项目里第一个表单控件（第二阶段第 1 项），样式与 Button / Card 保持一致。
 */
export function TextField({ label, hint, error, containerStyle, ...rest }: TextFieldProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <AppText variant="label" color={palette.textMuted} style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={palette.textMuted}
        {...rest}
        style={[styles.input, error ? styles.inputError : null, rest.multiline ? styles.multiline : null]}
      />
      {error ? (
        <AppText variant="caption" color={palette.danger} style={styles.message}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color={palette.textMuted} style={styles.message}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.text,
  },
  inputError: {
    borderColor: palette.danger,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  message: {
    marginTop: spacing.xs,
  },
});
