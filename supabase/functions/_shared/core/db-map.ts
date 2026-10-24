/** Maps Bridge database rows into the pure core types. Shared by Edge Functions and the app. */
import type { ClaimStatus, ContactEdge, ContactRecord, DirectRelationship, EdgeKind, Evidence, OwnerProfile, SourceKind, TagClaim, TextClaim } from './types.ts';

export interface DbContact {
  id: string; name: string; headline: string | null; company: string | null; school: string | null; location: string | null;
  how_met: string | null; relationship: string; relationship_source: string; relationship_status: string;
  last_interaction_at: string | null; archived: boolean; is_demo: boolean; created_at: string; linked_profile_id?: string | null;
  email?: string | null; phone?: string | null; links?: unknown;
}
export interface DbEvidence {
  id: string; contact_id: string; source: string; excerpt: string | null; note_id: string | null; import_record_id: string | null;
  url: string | null; observed_at: string; confidence: number;
}
export interface DbClaim { id: string; contact_id: string; kind: string; tag: string; label: string; status: string; evidence_id: string | null; created_at: string }
export interface DbEdge {
  id: string; from_contact_id: string | null; to_contact_id: string; kind: string; source: string; status: string;
  evidence_id: string | null; note: string | null; created_at: string;
}
export interface DbProfile { id: string; display_name: string }
export interface DbProfileTag { kind: string; tag: string; label: string; status: string }

export const SOURCE_LABELS: Record<SourceKind, string> = {
  self_reported: 'Self-reported', manual: 'Added by you', note: 'Your note', csv_import: 'CSV import', phone_contacts: 'Phone contacts',
  plugin: 'Connector import', extracted: 'Extracted from a note', ai_suggested: 'AI suggestion', demo: 'Demo data',
};

export function toSourceKind(s: string): SourceKind {
  return (Object.keys(SOURCE_LABELS) as SourceKind[]).includes(s as SourceKind) ? (s as SourceKind) : 'manual';
}
function toStatus(s: string): ClaimStatus {
  return s === 'suggested' || s === 'rejected' ? s : 'confirmed';
}
export function toRelationship(s: string): DirectRelationship {
  return (['personal', 'colleague', 'mutual_connection', 'follower', 'following'] as DirectRelationship[]).includes(s as DirectRelationship) ? (s as DirectRelationship) : 'unknown';
}

export function evidenceFromRow(e: DbEvidence | undefined, fallback: { source: string; status: string; at: string; excerpt?: string | null }): Evidence {
  if (!e) {
    const kind = toSourceKind(fallback.source);
    return { sourceKind: kind, sourceLabel: SOURCE_LABELS[kind], recordedAt: fallback.at, confidence: kind === 'ai_suggested' ? 0.5 : 1, status: toStatus(fallback.status), excerpt: fallback.excerpt ?? null };
  }
  const kind = toSourceKind(e.source);
  return {
    sourceKind: kind,
    sourceLabel: e.url ? `${SOURCE_LABELS[kind]} (${safeHost(e.url)})` : SOURCE_LABELS[kind],
    sourceRef: e.note_id ?? e.import_record_id ?? e.id,
    recordedAt: e.observed_at,
    confidence: e.confidence,
    status: toStatus(fallback.status),
    excerpt: e.excerpt || null,
  };
}
function safeHost(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'link'; }
}

export function mapContacts(contacts: DbContact[], claims: DbClaim[], evidence: DbEvidence[]): ContactRecord[] {
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const claimsByContact = new Map<string, DbClaim[]>();
  for (const c of claims) {
    if (c.status === 'rejected') continue;
    const arr = claimsByContact.get(c.contact_id) ?? [];
    arr.push(c);
    claimsByContact.set(c.contact_id, arr);
  }
  return contacts.map((c) => {
    const mine = claimsByContact.get(c.id) ?? [];
    const ev = (cl: DbClaim) => evidenceFromRow(cl.evidence_id ? evById.get(cl.evidence_id) : undefined, { source: 'manual', status: cl.status, at: cl.created_at });
    const tagClaims: TagClaim[] = mine.filter((cl) => cl.kind === 'skill' || cl.kind === 'tool' || cl.kind === 'interest')
      .map((cl) => ({ tag: cl.tag, kind: cl.kind === 'interest' ? 'interest' : 'skill', evidence: ev(cl) }));
    const text = (kind: string): TextClaim[] => mine.filter((cl) => cl.kind === kind).map((cl) => ({ text: cl.label, evidence: ev(cl) }));
    const orgs = [c.company, ...mine.filter((cl) => cl.kind === 'org').map((cl) => cl.label)].filter((x): x is string => !!x);
    return {
      id: c.id, displayName: c.name, headline: c.headline, organizations: orgs, school: c.school, city: c.location, howMet: c.how_met,
      relationshipContext: c.how_met, relationship: toRelationship(c.relationship),
      relationshipSource: { sourceKind: toSourceKind(c.relationship_source), sourceLabel: SOURCE_LABELS[toSourceKind(c.relationship_source)], recordedAt: c.created_at, confidence: 1, status: toStatus(c.relationship_status) },
      lastInteractionAt: c.last_interaction_at, claims: tagClaims, goals: text('goal'), offers: text('offer'), projects: text('project'),
      archived: c.archived, isDemo: c.is_demo,
    };
  });
}

const EDGE_KINDS: Record<string, EdgeKind | null> = {
  knows: 'knows', works_with: 'works_with', introduced: 'introduced', follows: 'following', followed_by: 'follower', same_org: null, same_school: null,
};

/** Only edges between two contacts become core edges; owner edges (from null) describe the owner's own relationship and are already on the contact. */
export function mapEdges(edges: DbEdge[], evidence: DbEvidence[]): ContactEdge[] {
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const out: ContactEdge[] = [];
  for (const e of edges) {
    const kind = EDGE_KINDS[e.kind];
    if (!kind || !e.from_contact_id || e.status === 'rejected') continue;
    out.push({ id: e.id, fromId: e.from_contact_id, toId: e.to_contact_id, kind, status: e.status === 'confirmed' ? 'confirmed' : 'unconfirmed',
      evidence: evidenceFromRow(e.evidence_id ? evById.get(e.evidence_id) : undefined, { source: e.source, status: e.status, at: e.created_at, excerpt: e.note }) });
  }
  return out;
}

export function mapOwner(profile: DbProfile, tags: DbProfileTag[]): OwnerProfile {
  const of = (k: string) => tags.filter((t) => t.kind === k && t.status !== 'rejected').map((t) => (k === 'goal' || k === 'offer' ? t.label : t.tag));
  return { id: profile.id, displayName: profile.display_name, skills: [...of('skill'), ...of('tool')], interests: of('interest'), goals: of('goal'), offers: of('offer'), lookingFor: of('goal') };
}

/** Text used for embeddings: public-ish claims only, never private notes verbatim. */
export function contactEmbeddingText(c: ContactRecord): string {
  return [c.displayName, c.headline ?? '', c.organizations.join(' '), c.claims.map((k) => k.tag.replace(/-/g, ' ')).join(' '),
    c.goals.map((g) => g.text).join(' '), c.offers.map((o) => o.text).join(' ')].join('\n');
}
