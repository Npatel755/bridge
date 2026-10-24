import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { BText, RouteKind, routeMetrics, useTheme } from '@/bridge-design-system';

export interface GraphNode { id: string; name: string; route: RouteKind }
export interface GraphEdge { from: string | null; to: string; kind: RouteKind }

/** "You" sits in the centre; cards are placed on a ring, sized to the available width. */
export function RelationshipGraph({ nodes, edges, selected, onSelect, caption }: {
  nodes: GraphNode[]; edges: GraphEdge[]; selected: string | null; onSelect: (id: string) => void; caption?: string;
}) {
  const { colors, sizes, radius, space } = useTheme();
  const [width, setWidth] = useState<number>(sizes.graphNodeWidth * 4);
  const shown = nodes.slice(0, 12);
  const height = shown.length > 6 ? sizes.graphHeight * 1.5 : sizes.graphHeight;
  const cx = width / 2, cy = height / 2;
  const rx = Math.max(0, (width - sizes.graphNodeWidth) / 2), ry = Math.max(0, (height - sizes.graphNodeHeight) / 2);
  const pos = new Map<string, { x: number; y: number }>([['you', { x: cx, y: cy }]]);
  shown.forEach((n, i) => {
    const a = -Math.PI / 2 + (i / shown.length) * Math.PI * 2;
    pos.set(n.id, { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  });
  const at = (id: string | null) => pos.get(id ?? 'you') ?? { x: cx, y: cy };
  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ minHeight: height }}>
        <Svg width={width} height={height} style={{ position: 'absolute' }} aria-hidden>
          {edges.filter((e) => pos.has(e.to) && (e.from === null || pos.has(e.from))).map((edge, i) => {
            const from = at(edge.from), to = at(edge.to);
            const stroke = edge.kind === 'direct' ? colors.action : edge.kind === 'intro' ? colors.ink : colors.inkSoft;
            return (
              <React.Fragment key={`${edge.from ?? 'you'}-${edge.to}-${i}`}>
                <Line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={stroke} strokeWidth={routeMetrics.stroke} strokeDasharray={edge.kind === 'suggested' ? `${routeMetrics.dash} ${routeMetrics.dash}` : undefined} />
                {edge.kind === 'intro' ? <Circle cx={(from.x + to.x) / 2} cy={(from.y + to.y) / 2} r={routeMetrics.radius} stroke={stroke} strokeWidth={routeMetrics.stroke} fill={colors.paper} /> : null}
              </React.Fragment>
            );
          })}
        </Svg>
        {[{ id: 'you', name: 'You', route: 'direct' as RouteKind }, ...shown].map((n) => {
          const p = at(n.id);
          const isYou = n.id === 'you';
          const sel = selected === n.id;
          return (
            <Pressable key={n.id} disabled={isYou} accessibilityRole={isYou ? 'text' : 'button'} accessibilityLabel={isYou ? 'You' : `${n.name}, ${n.route}`} accessibilityState={{ selected: sel }} onPress={() => onSelect(n.id)}
              style={{ position: 'absolute', left: p.x - sizes.graphNodeWidth / 2, top: p.y - sizes.graphNodeHeight / 2, minWidth: sizes.graphNodeWidth, minHeight: sizes.graphNodeHeight, alignItems: 'center', justifyContent: 'center', borderWidth: sel ? sizes.borderStrong : sizes.border, borderColor: sel ? colors.action : colors.cardEdge, borderStyle: n.route === 'suggested' ? 'dashed' : 'solid', borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, backgroundColor: colors.card, padding: space[2] }}>
              <BText variant="rowName">{isYou ? 'You' : n.name.split(' ').map((w) => w.charAt(0)).join('').slice(0, 3)}</BText>
            </Pressable>
          );
        })}
      </View>
      <BText variant="secondary" color="inkSoft">{caption ?? 'Solid: confirmed. Hollow dot: a possible introduction. Dashed: unconfirmed.'}</BText>
    </View>
  );
}
