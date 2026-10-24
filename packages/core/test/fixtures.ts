import type { ContactEdge, ContactRecord, Evidence, TagClaim, TextClaim } from '../src/index.ts';

export const NOW = new Date('2026-10-01T12:00:00Z');

export function ev(partial: Partial<Evidence> = {}): Evidence {
  return { sourceKind: 'note', sourceLabel: 'Your note', recordedAt: '2026-09-01T00:00:00Z', confidence: 0.9, status: 'confirmed', ...partial };
}

export function skill(tag: string, e: Partial<Evidence> = {}): TagClaim {
  return { tag, kind: 'skill', evidence: ev(e) };
}
export function interest(tag: string, e: Partial<Evidence> = {}): TagClaim {
  return { tag, kind: 'interest', evidence: ev(e) };
}
export function text(t: string, e: Partial<Evidence> = {}): TextClaim {
  return { text: t, evidence: ev(e) };
}

export function contact(id: string, displayName: string, partial: Partial<ContactRecord> = {}): ContactRecord {
  return { id, displayName, organizations: [], relationship: 'personal', claims: [], goals: [], offers: [], projects: [], ...partial };
}

export function edge(id: string, fromId: string, toId: string, partial: Partial<ContactEdge> = {}): ContactEdge {
  return { id, fromId, toId, kind: 'knows', status: 'confirmed', evidence: ev(), ...partial };
}

export const network = (): { contacts: ContactRecord[]; edges: ContactEdge[] } => {
  const contacts = [
    contact('maya', 'Maya Chen', { howMet: 'at a hackathon', claims: [skill('embedded-systems'), skill('firmware'), interest('cycling')], goals: [text('interested in joining a startup')] }),
    contact('jordan', 'Jordan Reyes', { claims: [skill('community-building'), interest('makerspace')] }),
    contact('priya', 'Priya Nair', { relationship: 'unknown', claims: [skill('manufacturing'), skill('injection-molding')] }),
    contact('sam', 'Sam Okafor', { claims: [skill('industrial-design', { recordedAt: '2022-01-01T00:00:00Z' })] }),
    contact('lee', 'Lee Park', { relationship: 'follower', relationshipSource: ev({ sourceKind: 'plugin', sourceLabel: 'Makerspace Community' }), claims: [skill('computer-vision', { sourceKind: 'plugin', sourceLabel: 'Makerspace Community' })] }),
    contact('ana', 'Ana Silva', { claims: [skill('computer-vision', { status: 'suggested', sourceKind: 'ai_suggested', sourceLabel: 'AI suggestion', confidence: 0.5 })] }),
  ];
  const edges = [
    edge('e1', 'jordan', 'priya'),
    edge('e2', 'maya', 'jordan'),
    edge('e3', 'lee', 'priya', { kind: 'follower' }),
  ];
  return { contacts, edges };
};
