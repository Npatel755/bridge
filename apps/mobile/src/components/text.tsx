import { Text as RNText, type TextProps } from 'react-native';

import { useTheme, type Colors } from '@/constants/theme';

type Variant = keyof ReturnType<typeof useTheme>['type'];

export interface TProps extends TextProps {
  variant?: Variant;
  color?: keyof Colors;
  center?: boolean;
}

/** All text goes through here so fonts/sizes/colors come from theme.ts only. */
export function T({ variant = 'body', color = 'ink', center, style, ...rest }: TProps) {
  const { type, colors } = useTheme();
  return <RNText allowFontScaling maxFontSizeMultiplier={1.6} style={[type[variant], { color: colors[color] }, center && { textAlign: 'center' }, style]} {...rest} />;
}

export const Display = (p: TProps) => <T accessibilityRole="header" variant="display" {...p} />;
export const Title = (p: TProps) => <T accessibilityRole="header" variant="title" {...p} />;
export const Name = (p: TProps) => <T variant="name" {...p} />;
export const Note = (p: TProps) => <T variant="note" {...p} />;
export const Body = (p: TProps) => <T variant="body" {...p} />;
export const Label = (p: TProps) => <T variant="label" {...p} />;
export const Caption = (p: TProps) => <T variant="caption" color="inkSoft" {...p} />;
