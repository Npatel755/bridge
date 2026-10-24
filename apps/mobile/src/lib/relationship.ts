import type { Route } from '@bridge/core';
import type { RouteKind } from '@/bridge-design-system';
export interface RouteInfo { kind: RouteKind; label: string }

const DIRECT = new Set(['friend', 'colleague', 'former_colleague', 'classmate', 'mentor', 'mentee', 'family', 'acquaintance', 'client', 'collaborator', 'met_once', 'personal']);
export const RELATIONSHIP_LABEL: Record<string, string> = {
  friend: 'Friend', colleague: 'Colleague', former_colleague: 'Former colleague', classmate: 'Classmate', mentor: 'Mentor', mentee: 'Mentee', family: 'Family', acquaintance: 'Acquaintance',
  client: 'Client', collaborator: 'Collaborator', met_once: 'Met once', personal: 'Personal', mutual_connection: 'Mutual connection (LinkedIn)', follower: 'Follows you', following: 'You follow', unknown: 'Unknown',
};

/** Route for a saved card: only confirmed personal relationships are "Direct". Followers are never a warm route. */
export function contactRoute(relationship: string | null, status: string | null): RouteInfo {
  if (relationship === 'follower') return { kind: 'suggested', label: 'Follows you, not a warm intro' };
  if (relationship === 'following') return { kind: 'suggested', label: 'You follow them, not a warm intro' };
  if (relationship && DIRECT.has(relationship) && status === 'confirmed') return { kind: 'direct', label: 'Direct' };
  if (relationship === 'mutual_connection') return { kind: 'suggested', label: 'Connected online' };
  return { kind: 'suggested', label: 'Unconfirmed' };
}

/** Route for an Ask/Team recommendation. Follow relationships are never a warm intro. */
export function routeInfo(route: Route, opts?: { howYouKnow?: string; long?: boolean }): RouteInfo {
  if (route.type === 'direct') return { kind: 'direct', label: 'Direct' };
  if (route.type === 'introduction' && route.path) {
    const via = route.path.hops[1]?.name ?? 'a contact';
    if (!route.path.confirmed) return { kind: 'suggested', label: `Via ${via.split(' ')[0]}, unconfirmed` };
    return { kind: 'intro', label: opts?.long ? `Via ${via}, possible intro` : `Via ${via.split(' ')[0]}` };
  }
  const how = opts?.howYouKnow ?? '';
  if (/you follow/i.test(how)) return { kind: 'suggested', label: 'You follow them, not a warm intro' };
  if (/follow/i.test(how)) return { kind: 'suggested', label: 'Follows you, not a warm intro' };
  return { kind: 'suggested', label: 'Unconfirmed' };
}
