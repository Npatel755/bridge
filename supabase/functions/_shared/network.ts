import type { Ctx } from './http.ts';
import { HttpError } from './http.ts';
import { mapContacts, mapEdges, mapOwner, contactEmbeddingText, cosine, type ContactRecord, type ContactEdge, type OwnerProfile, type DbContact, type DbClaim, type DbEvidence, type DbEdge } from './core/index.ts';
import { embed } from './llm.ts';

export interface Network { contacts: ContactRecord[]; edges: ContactEdge[]; owner: OwnerProfile }

export async function loadNetwork(ctx: Ctx): Promise<Network> {
  const [c, cl, ev, ed, pr, pt] = await Promise.all([
    ctx.db.from('contacts').select('*').eq('archived', false).limit(5000),
    ctx.db.from('contact_claims').select('*').limit(50000),
    ctx.db.from('evidence').select('*').limit(50000),
    ctx.db.from('contact_edges').select('*').limit(20000),
    ctx.db.from('profiles').select('id, display_name').eq('id', ctx.user.id).single(),
    ctx.db.from('profile_tags').select('kind, tag, label, status'),
  ]);
  for (const r of [c, cl, ev, ed, pr, pt]) if (r.error) throw new HttpError(500, r.error.message);
  return {
    contacts: mapContacts(c.data as DbContact[], cl.data as DbClaim[], ev.data as DbEvidence[]),
    edges: mapEdges(ed.data as DbEdge[], ev.data as DbEvidence[]),
    owner: mapOwner(pr.data!, pt.data ?? []),
  };
}

async function sha(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** Refreshes stale embeddings (owner-scoped) and returns semantic similarity for a query. */
export async function semanticScores(ctx: Ctx, contacts: ContactRecord[], query: string): Promise<{ scores: Map<string, number>; model: string }> {
  const texts = new Map(contacts.map((c) => [c.id, contactEmbeddingText(c)]));
  const hashes = new Map<string, string>();
  for (const [id, t] of texts) hashes.set(id, await sha(t));
  const { data: existing } = await ctx.db.from('contact_embeddings').select('contact_id, content_hash, model');
  const have = new Map((existing ?? []).map((e) => [e.contact_id, e]));
  const [{ vectors: [qv], model }] = await Promise.all([embed([query])]);
  const stale = contacts.filter((c) => have.get(c.id)?.content_hash !== hashes.get(c.id) || have.get(c.id)?.model !== model);
  if (stale.length) {
    const { vectors } = await embed(stale.map((c) => texts.get(c.id)!));
    const rows = stale.map((c, i) => ({ contact_id: c.id, owner_id: ctx.user.id, model, content_hash: hashes.get(c.id)!, embedding: JSON.stringify(vectors[i]), updated_at: new Date().toISOString() }));
    for (let i = 0; i < rows.length; i += 200) await ctx.db.from('contact_embeddings').upsert(rows.slice(i, i + 200));
  }
  const scores = new Map<string, number>();
  const { data: matched, error } = await ctx.db.rpc('match_contacts', { query_embedding: JSON.stringify(qv), match_count: 50 });
  if (!error && matched) for (const m of matched as { contact_id: string; similarity: number }[]) scores.set(m.contact_id, Math.max(0, m.similarity));
  else {
    // fallback: in-memory cosine on freshly computed vectors
    const { vectors } = await embed(contacts.map((c) => texts.get(c.id)!));
    contacts.forEach((c, i) => scores.set(c.id, Math.max(0, cosine(qv, vectors[i]))));
  }
  return { scores, model };
}
