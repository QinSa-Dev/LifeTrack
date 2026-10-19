import { Text, type TextProps } from 'react-native';

import { palette, typography } from '@/theme';

export type TextVariant = keyof typeof typography;

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
}

export function AppText({ variant = 'body', color = palette.text, style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[typography[variant], { color }, style]} />;
}
