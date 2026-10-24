import { serve, authed, json, readJson, rateLimit, HttpError } from '../_shared/http.ts';

serve(async (req) => {
  const ctx = await authed(req);
  const body = await readJson<{ action: string; confirm?: string }>(req, 10_000);
  if (body.action === 'export') {
    await rateLimit(ctx, 'export', 5, 3600);
    const { data, error } = await ctx.db.rpc('export_account');
    if (error) throw new HttpError(500, error.message);
    return json(data);
  }
  if (body.action === 'delete') {
    if (body.confirm !== 'DELETE') throw new HttpError(400, 'confirm must be "DELETE"');
    const { error } = await ctx.db.rpc('delete_account');
    if (error) throw new HttpError(500, error.message);
    return json({ ok: true });
  }
  throw new HttpError(400, 'unknown action');
});
