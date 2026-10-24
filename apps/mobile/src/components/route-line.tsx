import type { Route } from '@bridge/core';
import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { T } from '@/components/text';
import { routeStyle, useTheme } from '@/constants/theme';

export type RouteKind = keyof typeof routeStyle;
export interface RouteInfo { kind: RouteKind; label: string }

/** Map a grounded core Route into the three visual route kinds. Followers and unconfirmed links are never warm routes. */
export function routeInfo(route: Route, opts?: { follower?: boolean; long?: boolean }): RouteInfo {
  if (route.type === 'direct') return { kind: 'direct', label: 'Direct' };
  if (route.type === 'introduction' && route.path) {
    const via = route.path.hops[1]?.name ?? 'a contact';
    if (!route.path.confirmed) return { kind: 'suggested', label: `Via ${via.split(' ')[0]}, unconfirmed` };
    return { kind: 'intro', label: opts?.long ? `Via ${via}, possible intro` : `Via ${via.split(' ')[0]}` };
  }
  return { kind: 'suggested', label: opts?.follower ? 'Follows you, not a warm intro' : 'Unconfirmed' };
}

/** Small line glyph + label. Same drawing rules are used for graph edges. */
export function RouteGlyph({ kind, width = 28, color }: { kind: RouteKind; width?: number; color?: string }) {
  const { colors } = useTheme();
  const s = routeStyle[kind];
  const c = color ?? colors[s.color];
  const h = 8, y = h / 2, r = 2.5, mid = width / 2;
  return (
    <Svg width={width} height={h} aria-hidden>
      {s.dashed ? (
        <Line x1={1} y1={y} x2={width - 1} y2={y} stroke={c} strokeWidth={1.5} strokeDasharray="3 3" />
      ) : s.hollowMiddle ? (
        <>
          <Line x1={r} y1={y} x2={mid - r} y2={y} stroke={c} strokeWidth={1.5} />
          <Line x1={mid + r} y1={y} x2={width - r} y2={y} stroke={c} strokeWidth={1.5} />
          <Circle cx={r} cy={y} r={r} fill={c} />
          <Circle cx={mid} cy={y} r={r} fill={colors.card} stroke={c} strokeWidth={1.5} />
          <Circle cx={width - r} cy={y} r={r} fill={c} />
        </>
      ) : (
        <>
          <Line x1={r} y1={y} x2={width - r} y2={y} stroke={c} strokeWidth={1.5} />
          <Circle cx={r} cy={y} r={r} fill={c} />
          <Circle cx={width - r} cy={y} r={r} fill={c} />
        </>
      )}
    </Svg>
  );
}

export function RouteLine({ kind, label, caution }: RouteInfo & { caution?: boolean }) {
  const { colors, space } = useTheme();
  const color = caution ? colors.cautionInk : colors[routeStyle[kind].color];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }} accessibilityLabel={label}>
      <RouteGlyph kind={kind} color={color} />
      <T variant="label" style={{ color }}>{label}</T>
    </View>
  );
}
