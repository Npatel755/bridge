import type { ContactEdge, ContactRecord, DirectRelationship, Evidence } from './types.ts';

export const SELF = 'self';

/** Relationships the owner can reasonably use to ask directly. Followers are audience, not a route. */
export const DIRECT_ROUTE_RELATIONSHIPS: ReadonlySet<DirectRelationship> = new Set([
  'personal',
  'colleague',
  'mutual_connection',
]);

/** Edge kinds that can carry an introduction. Follower/following edges never can. */
export const INTRO_EDGE_KINDS: ReadonlySet<ContactEdge['kind']> = new Set(['knows', 'works_with', 'introduced']);

export interface PathHop {
  id: string;
  name: string;
}

export interface IntroPath {
  hops: PathHop[];
  edges: { fromId: string; toId: string; kind: ContactEdge['kind']; evidence: Evidence }[];
  confirmed: boolean;
}

export function hasDirectRoute(contact: ContactRecord): boolean {
  return DIRECT_ROUTE_RELATIONSHIPS.has(contact.relationship) && !contact.archived;
}

/**
 * Find introduction paths self -> direct contact -> ... -> target over explicit edges.
 * Only edges whose kind can carry an introduction are traversed; unconfirmed edges are
 * returned separately (as possibilities to verify), never as supported routes.
 */
export function findIntroPaths(
  targetId: string,
  contacts: ContactRecord[],
  edges: ContactEdge[],
  opts: { maxHops?: number; includeUnconfirmed?: boolean } = {},
): IntroPath[] {
  const maxHops = opts.maxHops ?? 3;
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const target = byId.get(targetId);
  if (!target || target.archived) return [];

  const usable = edges.filter(
    (e) => INTRO_EDGE_KINDS.has(e.kind) && (opts.includeUnconfirmed || e.status === 'confirmed'),
  );
  const adjacency = new Map<string, ContactEdge[]>();
  for (const edge of usable) {
    if (!byId.has(edge.fromId) || !byId.has(edge.toId)) continue;
    for (const [a, b] of [
      [edge.fromId, edge.toId],
      [edge.toId, edge.fromId],
    ] as const) {
      const list = adjacency.get(a) ?? [];
      list.push({ ...edge, fromId: a, toId: b });
      adjacency.set(a, list);
    }
  }

  const results: IntroPath[] = [];
  const starts = contacts.filter((c) => c.id !== targetId && hasDirectRoute(c));
  type State = { at: string; trail: ContactEdge[]; visited: Set<string> };
  const queue: State[] = starts.map((s) => ({ at: s.id, trail: [], visited: new Set([s.id]) }));
  let bestLength = Infinity;

  while (queue.length) {
    const state = queue.shift()!;
    if (state.trail.length >= maxHops - 1) continue;
    for (const edge of adjacency.get(state.at) ?? []) {
      if (state.visited.has(edge.toId)) continue;
      const nextBody = byId.get(edge.toId);
      if (!nextBody || nextBody.archived) continue;
      const trail = [...state.trail, edge];
      if (edge.toId === targetId) {
        if (trail.length > bestLength) continue;
        bestLength = trail.length;
        const ids = [trail[0].fromId, ...trail.map((t) => t.toId)];
        results.push({
          hops: [{ id: SELF, name: 'You' }, ...ids.map((id) => ({ id, name: byId.get(id)!.displayName }))],
          edges: trail.map((t) => ({ fromId: t.fromId, toId: t.toId, kind: t.kind, evidence: t.evidence })),
          confirmed: trail.every((t) => t.status === 'confirmed'),
        });
        continue;
      }
      queue.push({ at: edge.toId, trail, visited: new Set([...state.visited, edge.toId]) });
    }
  }
  return results.sort((a, b) => a.hops.length - b.hops.length || Number(b.confirmed) - Number(a.confirmed));
}

export interface GraphNode {
  id: string;
  label: string;
  kind: 'self' | 'contact';
  relationship?: DirectRelationship;
  x: number;
  y: number;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  kind: ContactEdge['kind'] | DirectRelationship;
  confirmed: boolean;
  direct: boolean;
}

/** Deterministic force-directed layout so the native graph can render with plain SVG. */
export function layoutNetwork(
  contacts: ContactRecord[],
  edges: ContactEdge[],
  opts: { width?: number; height?: number; iterations?: number } = {},
): { nodes: GraphNode[]; links: GraphLink[] } {
  const width = opts.width ?? 1000;
  const height = opts.height ?? 1000;
  const iterations = opts.iterations ?? 220;
  const visible = contacts.filter((c) => !c.archived);
  const ids = new Set(visible.map((c) => c.id));

  const links: GraphLink[] = [];
  for (const c of visible) {
    if (c.relationship === 'unknown') continue;
    links.push({
      id: `self-${c.id}`,
      source: SELF,
      target: c.id,
      kind: c.relationship,
      confirmed: c.relationship !== 'follower' && c.relationship !== 'following',
      direct: true,
    });
  }
  for (const e of edges) {
    if (!ids.has(e.fromId) || !ids.has(e.toId)) continue;
    links.push({
      id: e.id,
      source: e.fromId,
      target: e.toId,
      kind: e.kind,
      confirmed: e.status === 'confirmed',
      direct: false,
    });
  }

  const nodes: GraphNode[] = [
    { id: SELF, label: 'You', kind: 'self', x: width / 2, y: height / 2 },
    ...visible.map((c, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, visible.length);
      const r = Math.min(width, height) * (0.25 + 0.15 * (i % 3) / 2);
      return {
        id: c.id,
        label: c.displayName,
        kind: 'contact' as const,
        relationship: c.relationship,
        x: width / 2 + r * Math.cos(angle),
        y: height / 2 + r * Math.sin(angle),
      };
    }),
  ];
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const k = Math.sqrt((width * height) / Math.max(1, nodes.length)) * 0.6;

  for (let iter = 0; iter < iterations; iter++) {
    const temp = (1 - iter / iterations) * width * 0.05;
    const disp = nodes.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x || 0.01;
        const dy = nodes[i].y - nodes[j].y || 0.01;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const force = (k * k) / dist;
        disp[i].x += (dx / dist) * force;
        disp[i].y += (dy / dist) * force;
        disp[j].x -= (dx / dist) * force;
        disp[j].y -= (dy / dist) * force;
      }
    }
    for (const l of links) {
      const a = index.get(l.source)!;
      const b = index.get(l.target)!;
      const dx = nodes[a].x - nodes[b].x;
      const dy = nodes[a].y - nodes[b].y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const force = ((dist * dist) / k) * (l.direct ? 0.6 : 1);
      disp[a].x -= (dx / dist) * force;
      disp[a].y -= (dy / dist) * force;
      disp[b].x += (dx / dist) * force;
      disp[b].y += (dy / dist) * force;
    }
    for (let i = 1; i < nodes.length; i++) {
      const d = Math.max(1, Math.hypot(disp[i].x, disp[i].y));
      nodes[i].x = Math.min(width - 30, Math.max(30, nodes[i].x + (disp[i].x / d) * Math.min(d, temp)));
      nodes[i].y = Math.min(height - 30, Math.max(30, nodes[i].y + (disp[i].y / d) * Math.min(d, temp)));
    }
  }
  return { nodes, links };
}
