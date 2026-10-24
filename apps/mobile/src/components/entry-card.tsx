import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { RouteLine } from '@/components/route-line';
import type { RouteInfo } from '@/components/route-line';
import { T } from '@/components/text';
import { useTheme } from '@/constants/theme';

export interface EntryCardProps {
  name: string;
  role?: string | null;
  route?: RouteInfo | null;
  /** Monogram override. Defaults to the person's initials. */
  letter?: string;
  /** Right side of the head row when there is no route (e.g. "Within ~100 m"). */
  headRight?: ReactNode;
  /** Kept for API compatibility; this design has no stacked peek. */
  stacked?: boolean;
  /** Compact row: avatar + head row only. */
  collapsed?: boolean;
  tabOffset?: number;
  tone?: 'default' | 'nearby';
  tabText?: string;
  cautionRole?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function surnameLetter(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase();
}
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function Rule({ spacing }: { spacing?: number }) {
  const { colors, space } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.rule, marginVertical: spacing ?? space[3] }} />;
}

export function Inset({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors, radius, space } = useTheme();
  return <View style={[{ backgroundColor: colors.paper, borderRadius: radius.chip, padding: space[3], gap: space[1] }, style]}>{children}</View>;
}

export function Avatar({ name, letter, tone = 'default', size }: { name: string; letter?: string; tone?: 'default' | 'nearby'; size?: number }) {
  const { colors, sizes, type } = useTheme();
  const s = size ?? sizes.avatar;
  return (
    <View aria-hidden style={{ width: s, height: s, borderRadius: s / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'nearby' ? colors.nearbyWash : colors.tab }}>
      <T style={[type.tabLetter, { color: tone === 'nearby' ? colors.nearbyInk : colors.inkSoft, fontSize: s >= 40 ? 14 : 12 }]}>{letter ?? initials(name)}</T>
    </View>
  );
}

/** A person is always a card: monogram, name, role, route. The whole card is one button. */
export function EntryCard({ name, role, route, letter, headRight, collapsed, tone = 'default', tabText, cautionRole, onPress, accessibilityLabel, style, children }: PropsWithChildren<EntryCardProps>) {
  const { colors, radius, space } = useTheme();
  const nearby = tone === 'nearby';
  const a11y = accessibilityLabel ?? [name, role, route?.label].filter(Boolean).join(', ');
  const body = (
    <View style={[styles.body, { backgroundColor: colors.card, borderColor: nearby ? colors.nearby : colors.cardEdge, borderRadius: radius.card, paddingHorizontal: space[4], paddingVertical: collapsed ? space[3] : space[4] }, style]}>
      {nearby && tabText ? (
        <View style={{ alignSelf: 'flex-start', backgroundColor: colors.nearby, borderRadius: radius.chip, paddingHorizontal: space[2], paddingVertical: 2, marginBottom: space[3] }}>
          <T variant="caption" style={{ color: colors.onAction }}>{tabText}</T>
        </View>
      ) : null}
      <View style={[styles.head, { gap: space[3] }]}>
        <Avatar name={name} letter={letter && letter.length <= 2 ? letter : undefined} tone={tone} size={collapsed ? 32 : undefined} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="name">{name}</T>
          {role ? <T variant="caption" style={{ fontSize: 13, lineHeight: 18, color: cautionRole ? colors.cautionInk : colors.inkSoft }}>{role}</T> : null}
        </View>
        {route ? <RouteLine {...route} /> : headRight}
      </View>
      {!collapsed && children ? <><Rule />{children}</> : null}
    </View>
  );
  if (!onPress) return <View accessible accessibilityLabel={a11y}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={({ pressed }) => pressed && { opacity: 0.9 }}>
      {body}
    </Pressable>
  );
}

export function CardSection({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { space } = useTheme();
  return <View style={[{ gap: space[2] }, style]}>{children}</View>;
}

export function TagRow({ children }: PropsWithChildren) {
  const { space } = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{children}</View>;
}

const styles = StyleSheet.create({
  body: { borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
