import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { T } from '@/components/text';
import { routeStyle, useTheme } from '@/constants/theme';
import type { RouteKind } from '@/components/route-line';

export interface GraphNode { id: string; name: string; dim?: boolean; route: RouteKind }
export interface GraphEdge { from: string | null; to: string; kind: RouteKind }

/** Radial graph: you at the center, cards around you. Edge styles are the route styles. Not a replacement for the list, which stays available. */
export function NetworkGraph({ nodes, edges, size = 340, onSelect, meLabel }: { nodes: GraphNode[]; edges: GraphEdge[]; size?: number; onSelect: (id: string) => void; meLabel: string }) {
  const { colors, fonts, space } = useTheme();
  const c = size / 2;
  const layout = useMemo(() => {
    const n = Math.max(nodes.length, 1);
    const ring1 = Math.min(n, 12);
    return nodes.map((node, i) => {
      const inner = i < ring1;
      const count = inner ? ring1 : n - ring1;
      const idx = inner ? i : i - ring1;
      const r = inner ? c * 0.52 : c * 0.86;
      const a = (idx / count) * Math.PI * 2 - Math.PI / 2 + (inner ? 0 : Math.PI / count);
      return { ...node, x: c + Math.cos(a) * r, y: c + Math.sin(a) * r };
    });
  }, [nodes, c]);
  const pos = new Map(layout.map((n) => [n.id, n]));
  const edgeColor = (k: RouteKind) => colors[routeStyle[k].color];
  return (
    <View style={{ alignItems: 'center', gap: space[2] }}>
      <Svg width={size} height={size} accessibilityLabel={`Network graph with ${nodes.length} cards`}>
        {edges.map((e, i) => {
          const a = e.from ? pos.get(e.from) : { x: c, y: c };
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const s = routeStyle[e.kind];
          return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={edgeColor(e.kind)} strokeWidth={e.kind === 'direct' ? 1.5 : 1} strokeDasharray={s.dashed ? '3 3' : undefined} opacity={0.9} />;
        })}
        <Circle cx={c} cy={c} r={14} fill={colors.ink} />
        <SvgText x={c} y={c + 4} fontFamily={fonts.ui} fontSize={10} fill={colors.card} textAnchor="middle">{meLabel}</SvgText>
        {layout.map((n) => (
          <G key={n.id} opacity={n.dim ? 0.3 : 1} onPress={() => onSelect(n.id)}>
            <Circle cx={n.x} cy={n.y} r={16} fill={colors.card} stroke={edgeColor(n.route)} strokeWidth={1.5} strokeDasharray={routeStyle[n.route].dashed ? '3 3' : undefined} />
            <SvgText x={n.x} y={n.y + 4} fontFamily={fonts.noteMedium} fontSize={11} fill={colors.ink} textAnchor="middle">{n.name.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}</SvgText>
            <SvgText x={n.x} y={n.y + 28} fontFamily={fonts.ui} fontSize={9} fill={colors.inkSoft} textAnchor="middle">{n.name.split(' ')[0]}</SvgText>
          </G>
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3], justifyContent: 'center' }}>
        {layout.map((n) => <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`${n.name}, ${n.route}`} onPress={() => onSelect(n.id)} hitSlop={6}><T variant="caption" color={n.dim ? 'inkFaint' : 'inkSoft'}>{n.name}</T></Pressable>)}
      </View>
    </View>
  );
}
