import type { RouteInfo } from '@/components/route-line';

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
