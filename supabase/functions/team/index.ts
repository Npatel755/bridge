import { serve, authed, json, readJson, rateLimit, str, HttpError } from '../_shared/http.ts';
import { decomposeProject, buildTeam, customRole, findHelpOpportunities, type TeamRole } from '../_shared/core/index.ts';
import { loadNetwork, semanticScores } from '../_shared/network.ts';

serve(async (req) => {
  const ctx = await authed(req);
  await rateLimit(ctx, 'team', 30, 3600);
  const body = await readJson<{ description: unknown; roles?: unknown; requestId?: string }>(req, 50_000);
  const description = str(body.description, 2000, 'description');
  let roles: TeamRole[];
  if (Array.isArray(body.roles) && body.roles.length) {
    if (body.roles.length > 12) throw new HttpError(400, 'max 12 roles');
    roles = body.roles.map((r: { id?: string; title?: unknown; tags?: unknown; description?: unknown; custom?: boolean }) => {
      const title = str(r.title, 80, 'role.title');
      const tags = Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === 'string').slice(0, 10) : [];
      const role = customRole(title, tags, typeof r.description === 'string' ? r.description.slice(0, 300) : '');
      return { ...role, id: typeof r.id === 'string' ? r.id.slice(0, 80) : role.id, custom: r.custom ?? true };
    });
  } else roles = decomposeProject(description);
  const net = await loadNetwork(ctx);
  const { scores } = await semanticScores(ctx, net.contacts, description);
  const plan = buildTeam(description, roles, net.contacts, net.edges, { semantic: scores });
  const reciprocal = findHelpOpportunities(net.owner, net.contacts, 6);
  const payload = { ...plan, reciprocal, mode: 'deterministic' as const };
  const row = { owner_id: ctx.user.id, description, roles, plan: payload };
  const saved = body.requestId
    ? await ctx.db.from('project_requests').update(row).eq('id', body.requestId).select('id').single()
    : await ctx.db.from('project_requests').insert(row).select('id').single();
  return json({ ...payload, requestId: saved.data?.id ?? null });
});
