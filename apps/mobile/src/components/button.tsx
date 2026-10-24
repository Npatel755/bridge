import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { T } from '@/components/text';
import { useTheme } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Primary: at most one per screen. Danger is text-only and callers confirm in a sheet. */
export function Button({ title, variant = 'secondary', size = 'md', loading, disabled, icon, style, onPress, ...rest }: ButtonProps) {
  const { colors, radius, sizes, space } = useTheme();
  const height = size === 'sm' ? sizes.buttonSm : size === 'lg' ? sizes.buttonLg : sizes.button;
  const bg = variant === 'primary' ? colors.action : variant === 'secondary' ? colors.card : 'transparent';
  const fg = variant === 'primary' ? colors.onAction : variant === 'ghost' ? colors.action : variant === 'danger' ? colors.dangerInk : colors.ink;
  const isDisabled = !!disabled || !!loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      disabled={isDisabled}
      hitSlop={size === 'sm' ? (sizes.touch - height) / 2 : undefined}
      onPress={(e) => { if (variant === 'primary') haptic.light(); onPress?.(e); }}
      style={({ pressed }) => [
        styles.base,
        { minHeight: height, borderRadius: radius.card, backgroundColor: bg, paddingHorizontal: variant === 'ghost' || variant === 'danger' ? space[2] : space[4], gap: space[2] },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.cardEdge },
        size === 'lg' && { alignSelf: 'stretch' },
        isDisabled && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
        style,
      ]}
      {...rest}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <View>{icon}</View> : null}
      <T variant={size === 'sm' ? 'label' : 'body'} style={[{ color: fg }, size !== 'sm' && styles.medium]}>{title}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  medium: { fontFamily: 'InterTight_500Medium' },
});
