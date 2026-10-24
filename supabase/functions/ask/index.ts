import { serve, authed, json, readJson, rateLimit, str } from '../_shared/http.ts';
import { askNetwork, findHelpOpportunities } from '../_shared/core/index.ts';
import { loadNetwork, semanticScores } from '../_shared/network.ts';
import { llmConfigured, completeJson } from '../_shared/llm.ts';

serve(async (req) => {
  const ctx = await authed(req);
  await rateLimit(ctx, 'ask', 60, 3600);
  const body = await readJson<{ query: unknown; save?: boolean }>(req, 20_000);
  const query = str(body.query, 500, 'query');
  const net = await loadNetwork(ctx);
  const { scores, model } = await semanticScores(ctx, net.contacts, query);
  const result = askNetwork(query, net.contacts, net.edges, { semantic: scores, limit: 8 });
  let mode: 'deterministic' | 'llm' = 'deterministic';
  if (llmConfigured() && result.recommendations.length) {
    // LLM only rewrites explanations for already-grounded recommendations; it cannot add or reorder people.
    const grounded = result.recommendations.map((r) => ({ id: r.contactId, name: r.name, why: r.why, citations: r.citations.map((c) => c.value), route: r.route }));
    const out = await completeJson<{ items: { id: string; why: string }[] }>(
      'Rewrite each "why" as one friendly sentence using only the provided citations. Do not add facts, skills, or relationships.',
      JSON.stringify({ query, items: grounded }), '{"items":[{"id":string,"why":string}]}');
    if (out?.items) {
      for (const it of out.items) {
        const r = result.recommendations.find((x) => x.contactId === it.id);
        if (r && typeof it.why === 'string' && it.why.length < 400) r.why = it.why;
      }
      mode = 'llm';
    }
  }
  const reciprocal = findHelpOpportunities(net.owner, net.contacts, 4);
  const payload = { ...result, mode, embeddingModel: model, reciprocal };
  if (body.save !== false) await ctx.db.from('ask_queries').insert({ owner_id: ctx.user.id, query, mode, result: payload });
  return json(payload);
});
