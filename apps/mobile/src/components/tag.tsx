import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/text';
import { useTheme } from '@/constants/theme';

export interface TagProps {
  label: string;
  /** Stated = on the card; suggested = extracted/imported and not confirmed; selected = pickers & filters. */
  state?: 'stated' | 'suggested' | 'selected';
  hint?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function Tag({ label, state = 'stated', hint, onPress, accessibilityLabel }: TagProps) {
  const { colors, radius, space, sizes } = useTheme();
  const bg = state === 'selected' ? colors.ink : state === 'stated' ? colors.tab : 'transparent';
  const fg = state === 'selected' ? colors.card : state === 'suggested' ? colors.inkSoft : colors.ink;
  const inner = (
    <View style={[styles.tag, { backgroundColor: bg, borderRadius: radius.chip, paddingHorizontal: space[2] }, state === 'suggested' && { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.cardEdge }]}>
      <T variant="label" style={{ color: fg }}>{state === 'suggested' ? `Suggested: ${label}` : label}</T>
      {hint ? <T variant="caption" style={{ color: state === 'selected' ? colors.card : colors.inkSoft, marginLeft: space[1] }}>{hint}</T> : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: state === 'selected' }} hitSlop={(sizes.touch - 26) / 2}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({ tag: { height: 26, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' } });
