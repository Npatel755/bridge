import type { ConnectorResponse, ImportedEdge, ImportedPerson, ImportedRecord } from './protocol.ts';
import { RELATIONSHIP_TYPES } from './manifest.ts';

const MAX_STR = 500;
const EDGE_KINDS = ['follows', 'followed_by', 'knows', 'works_with', 'same_org', 'same_school'];
const TAG_KINDS = ['skill', 'interest', 'org', 'role'];

function clean(v: unknown, max = MAX_STR): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return s ? s.slice(0, max) : undefined;
}
function isoDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
function conf(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}
function httpUrl(v: unknown): string | undefined {
  const s = clean(v, 2000);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
function provenance(v: unknown, fallbackSource: string): { source: string; retrievedAt: string; url?: string } {
  const o = (typeof v === 'object' && v) || {};
  const r = o as Record<string, unknown>;
  return {
    source: clean(r.source, 120) ?? fallbackSource,
    retrievedAt: isoDate(r.retrievedAt) ?? new Date().toISOString(),
    url: httpUrl(r.url),
  };
}

export interface RecordValidation {
  records: ImportedRecord[];
  rejected: { index: number; reason: string }[];
}

/** Sanitizes and validates connector output. Unknown fields are dropped; invalid records are rejected, never "fixed up" into claims. */
export function validateRecords(input: unknown, pluginId: string, maxRecords: number): RecordValidation {
  const rejected: { index: number; reason: string }[] = [];
  const records: ImportedRecord[] = [];
  if (!Array.isArray(input)) return { records, rejected: [{ index: -1, reason: 'records must be an array' }] };
  if (input.length > maxRecords) rejected.push({ index: -1, reason: `truncated to maxRecords=${maxRecords}` });
  input.slice(0, maxRecords).forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null) return void rejected.push({ index, reason: 'not an object' });
    const r = raw as Record<string, unknown>;
    if (r.kind === 'person') {
      const name = clean(r.name, 200);
      if (!name) return void rejected.push({ index, reason: 'person.name required' });
      const relationship = RELATIONSHIP_TYPES.includes(r.relationship as never) ? (r.relationship as ImportedPerson['relationship']) : 'unknown';
      const prov: ImportedPerson['provenance'] = {};
      if (typeof r.provenance === 'object' && r.provenance)
        for (const [k, v] of Object.entries(r.provenance as Record<string, unknown>).slice(0, 40))
          prov[clean(k, 60) ?? 'field'] = provenance(v, pluginId);
      const tags: ImportedPerson['suggestedTags'] = [];
      if (Array.isArray(r.suggestedTags))
        for (const t of r.suggestedTags.slice(0, 20)) {
          const tt = t as Record<string, unknown>;
          const tag = clean(tt.tag, 80)?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          if (!tag || !TAG_KINDS.includes(String(tt.kind))) continue;
          tags.push({ kind: tt.kind as never, tag, label: clean(tt.label, 80) ?? tag, basis: clean(tt.basis, 200) ?? 'connector' });
        }
      records.push({
        kind: 'person',
        providerId: clean(r.providerId, 200),
        sourceUrl: httpUrl(r.sourceUrl),
        name,
        firstName: clean(r.firstName, 100),
        lastName: clean(r.lastName, 100),
        email: clean(r.email, 254)?.toLowerCase(),
        headline: clean(r.headline, 300),
        company: clean(r.company, 200),
        school: clean(r.school, 200),
        location: clean(r.location, 200),
        relationship,
        direction: ['outbound', 'inbound', 'mutual'].includes(String(r.direction)) ? (r.direction as never) : undefined,
        connectedAt: isoDate(r.connectedAt),
        confidence: conf(r.confidence),
        provenance: prov,
        suggestedTags: tags,
      });
    } else if (r.kind === 'edge') {
      const to = clean(r.toProviderId, 200);
      if (!to) return void rejected.push({ index, reason: 'edge.toProviderId required' });
      if (!EDGE_KINDS.includes(String(r.edgeKind))) return void rejected.push({ index, reason: 'edge.edgeKind invalid' });
      const from = r.fromProviderId === null ? null : clean(r.fromProviderId, 200);
      if (from === undefined) return void rejected.push({ index, reason: 'edge.fromProviderId must be string or null' });
      records.push({
        kind: 'edge',
        fromProviderId: from,
        toProviderId: to,
        edgeKind: r.edgeKind as ImportedEdge['edgeKind'],
        confidence: conf(r.confidence),
        provenance: provenance(r.provenance, pluginId),
      });
    } else rejected.push({ index, reason: 'kind must be person|edge' });
  });
  return { records, rejected };
}

export function validateResponse(input: unknown, pluginId: string, maxRecords: number): ConnectorResponse & { rejected: { index: number; reason: string }[] } {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'response must be an object', rejected: [] };
  const r = input as Record<string, unknown>;
  if (r.ok !== true) return { ok: false, error: clean(r.error, 500) ?? 'connector reported failure', rejected: [] };
  const { records, rejected } = validateRecords(r.records ?? [], pluginId, maxRecords);
  const warnings = Array.isArray(r.warnings) ? r.warnings.map((w) => clean(w, 300)).filter((w): w is string => !!w).slice(0, 20) : [];
  const cursor = typeof r.cursor === 'object' && r.cursor && !Array.isArray(r.cursor) && JSON.stringify(r.cursor).length < 4000 ? (r.cursor as Record<string, unknown>) : undefined;
  return { ok: true, records, rejected, warnings, cursor };
}

/** Relationship semantics the host enforces regardless of what a connector says. */
export function isPersonalRelationship(rel: ImportedPerson['relationship']): boolean {
  return rel === 'personal' || rel === 'colleague';
}
export function isWarmRoute(rel: ImportedPerson['relationship']): boolean {
  return rel === 'personal' || rel === 'colleague' || rel === 'mutual_connection';
}
