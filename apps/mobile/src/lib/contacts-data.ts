import { SOURCE_LABELS, normalizeTag, tagLabel } from '@bridge/core';

import { supabase } from '@/lib/supabase';

export const sourceLabel = (s: string) => (SOURCE_LABELS as Record<string, string>)[s] ?? s;

export interface NewContact {
  name: string; headline?: string; company?: string; school?: string; location?: string; email?: string | null; how_met?: string; met_at?: string | null;
  relationship?: string; relationship_source?: string; relationship_status?: 'confirmed' | 'suggested'; links?: { label: string; url: string }[];
}

export async function createContact(ownerId: string, c: NewContact): Promise<string> {
  const { data, error } = await supabase.from('contacts').insert({ owner_id: ownerId, relationship: 'acquaintance', relationship_source: 'manual', relationship_status: 'confirmed', ...c, email: c.email || null }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function addEvidence(ownerId: string, contactId: string, source: string, excerpt: string, extra: { note_id?: string; url?: string | null; observed_at?: string; confidence?: number } = {}): Promise<string> {
  const { data, error } = await supabase.from('evidence').insert({ owner_id: ownerId, contact_id: contactId, source, excerpt: excerpt.slice(0, 2000), observed_at: extra.observed_at ?? new Date().toISOString(), confidence: extra.confidence ?? 1, note_id: extra.note_id ?? null, url: extra.url ?? null }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function addClaims(ownerId: string, contactId: string, evidenceId: string | null, claims: { kind: string; label: string; status?: 'confirmed' | 'suggested' }[]) {
  const rows = claims.filter((c) => c.label.trim()).map((c) => ({ owner_id: ownerId, contact_id: contactId, evidence_id: evidenceId, kind: c.kind, tag: normalizeTag(c.label), label: tagLabel(normalizeTag(c.label)) || c.label.trim(), status: c.status ?? 'confirmed' }));
  if (!rows.length) return;
  const { error } = await supabase.from('contact_claims').insert(rows);
  if (error && !/duplicate/i.test(error.message)) throw error;
}

export const splitList = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
