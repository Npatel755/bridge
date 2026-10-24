import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface Ctx { user: { id: string }; db: SupabaseClient; admin: SupabaseClient }

/** Builds a user-scoped client (RLS applies) and an admin client (service role; used only for rate limits / restricted tables). */
export async function authed(req: Request): Promise<Ctx> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'Missing bearer token');
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await db.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new HttpError(401, 'Invalid session');
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  return { user: { id: data.user.id }, db, admin };
}

export async function rateLimit(ctx: Ctx, bucket: string, limit: number, windowSec: number): Promise<void> {
  const { data, error } = await ctx.admin.rpc('take_rate_limit', { p_owner: ctx.user.id, p_bucket: bucket, p_limit: limit, p_window_sec: windowSec });
  if (error) throw new HttpError(500, `rate limit check failed: ${error.message}`);
  if (data === false) throw new HttpError(429, 'Too many requests; try again shortly');
}

export async function readJson<T>(req: Request, maxBytes = 1_000_000): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) throw new HttpError(413, 'Payload too large');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Payload too large');
  try { return JSON.parse(text) as T; } catch { throw new HttpError(400, 'Invalid JSON'); }
}

export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    try { return await handler(req); }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Internal error' }, 500);
    }
  });
}

export function str(v: unknown, max: number, name: string): string {
  if (typeof v !== 'string') throw new HttpError(400, `${name} must be a string`);
  const s = v.trim();
  if (!s) throw new HttpError(400, `${name} is required`);
  if (s.length > max) throw new HttpError(400, `${name} too long (max ${max})`);
  return s;
}
