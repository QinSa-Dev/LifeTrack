/**
 * 基础主题。
 *
 * 第一阶段只有浅色一套（app.json 里 userInterfaceStyle 为 light）。
 * 但所有界面都通过 useTheme() 取色与尺寸，将来加深色主题不需要改组件。
 */

import { Platform } from 'react-native';

export const palette = {
  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF0F6',
  border: '#E3E6EF',
  text: '#171A21',
  textMuted: '#6B7280',
  primary: '#3B6EF6',
  primarySoft: '#E9EFFF',
  danger: '#D64545',
  dangerSoft: '#FDECEC',
  success: '#1B9C63',
  successSoft: '#E7F6EE',
  warning: '#B0731A',
  warningSoft: '#FDF3E2',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  subtitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  mono: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
} as const;

export const theme = { palette, spacing, radius, typography } as const;

export type Theme = typeof theme;

export function useTheme(): Theme {
  return theme;
}
