import { serve, authed, json, readJson, rateLimit, str, HttpError } from '../_shared/http.ts';
import { extractFromNote, normalizeTag, type NoteExtraction } from '../_shared/core/index.ts';
import { llmConfigured, completeJson } from '../_shared/llm.ts';

serve(async (req) => {
  const ctx = await authed(req);
  await rateLimit(ctx, 'extract', 120, 3600);
  const body = await readJson<{ noteId?: unknown; text?: unknown }>(req, 60_000);
  let text: string;
  let noteId: string | null = null;
  if (typeof body.noteId === 'string') {
    const { data, error } = await ctx.db.from('notes').select('id, body').eq('id', body.noteId).single();
    if (error || !data) throw new HttpError(404, 'note not found');
    text = data.body; noteId = data.id;
  } else text = str(body.text, 20_000, 'text');
  const { data: known } = await ctx.db.from('contacts').select('id, name, first_name').eq('archived', false).limit(5000);
  const knownContacts = (known ?? []).map((k) => ({ id: k.id, displayName: k.name, aliases: k.first_name ? [k.first_name] : [] }));
  let result: NoteExtraction = extractFromNote(text, knownContacts);
  if (llmConfigured()) {
    // The model may only propose tags for people the deterministic pass already found in the text; names are never invented.
    const out = await completeJson<{ people: { mention: string; skills: string[]; interests: string[] }[] }>(
      'Extract skills and interests per named person from the note. Only use names that literally appear in the note.',
      text, '{"people":[{"mention":string,"skills":string[],"interests":string[]}]}');
    if (out?.people) {
      for (const p of out.people) {
        const target = result.people.find((x) => x.mention.toLowerCase() === String(p.mention).toLowerCase());
        if (!target) continue;
        for (const s of [...(p.skills ?? []).map((t) => ({ t, k: 'skill' as const })), ...(p.interests ?? []).map((t) => ({ t, k: 'interest' as const }))]) {
          const tag = normalizeTag(String(s.t));
          if (tag && !target.tags.some((x) => x.tag === tag)) target.tags.push({ tag, kind: s.k, phrase: String(s.t).slice(0, 80) });
        }
      }
      result = { ...result, mode: 'llm' };
    }
  }
  if (noteId) await ctx.db.from('notes').update({ extraction_status: 'suggested', extraction: result }).eq('id', noteId);
  return json(result);
});
