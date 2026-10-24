/** Plugin host. Actions: list, install, uninstall, preview, import, sync, disconnect, health.
 *  Community connectors run as external services called with validated JSON; their output is validated before touching the DB. */
import { serve, authed, json, readJson, rateLimit, str, HttpError, type Ctx } from '../_shared/http.ts';
import { validateManifest, validateResponse, isAllowedServiceHost, type PluginManifest, type ConnectorRequest, type ImportedPerson, type ImportedEdge } from '../_shared/plugin-sdk/index.ts';
import { runLinkedInExport } from '../_shared/connectors/linkedin-export.ts';
import { detectDuplicates, normalizeName } from '../_shared/core/index.ts';

type Body = { action: string; pluginId?: string; fileText?: string; fileName?: string; accountId?: string; jobId?: string; deleteData?: boolean; accept?: string[] };

serve(async (req) => {
  const ctx = await authed(req);
  const body = await readJson<Body>(req, 6_000_000);
  const action = str(body.action, 20, 'action');
  switch (action) {
    case 'list': return json(await list(ctx));
    case 'install': return json(await install(ctx, str(body.pluginId, 64, 'pluginId')));
    case 'uninstall': return json(await uninstall(ctx, str(body.pluginId, 64, 'pluginId')));
    case 'preview':
    case 'import': {
      await rateLimit(ctx, 'plugin-run', 20, 3600);
      return json(await run(ctx, str(body.pluginId, 64, 'pluginId'), action, body));
    }
    case 'disconnect': {
      const { data, error } = await ctx.db.rpc('disconnect_connector', { p_account_id: str(body.accountId, 40, 'accountId'), p_delete_data: body.deleteData !== false });
      if (error) throw new HttpError(400, error.message);
      return json(data);
    }
    default: throw new HttpError(400, `unknown action ${action}`);
  }
});

async function list(ctx: Ctx) {
  const [p, i, a, j] = await Promise.all([
    ctx.db.from('plugins').select('*').order('kind'),
    ctx.db.from('plugin_installations').select('*'),
    ctx.db.from('connector_accounts').select('*'),
    ctx.db.from('sync_jobs').select('*').order('created_at', { ascending: false }).limit(20),
  ]);
  return { plugins: p.data ?? [], installations: i.data ?? [], accounts: a.data ?? [], jobs: j.data ?? [], env: { linkedinOAuth: !!Deno.env.get('LINKEDIN_CLIENT_ID') } };
}

async function manifestFor(ctx: Ctx, pluginId: string): Promise<{ row: Record<string, unknown>; manifest: PluginManifest }> {
  const { data, error } = await ctx.db.from('plugins').select('*').eq('id', pluginId).single();
  if (error || !data) throw new HttpError(404, 'plugin not found');
  if (data.status !== 'active') throw new HttpError(403, `plugin is ${data.status}`);
  const v = validateManifest(data.manifest);
  if (!v.ok || !v.value) throw new HttpError(500, `plugin manifest invalid: ${v.errors.join('; ')}`);
  return { row: data, manifest: v.value };
}

async function install(ctx: Ctx, pluginId: string) {
  const { manifest } = await manifestFor(ctx, pluginId);
  const { data, error } = await ctx.db.from('plugin_installations')
    .upsert({ owner_id: ctx.user.id, plugin_id: pluginId, enabled: true, granted_capabilities: manifest.capabilities }, { onConflict: 'owner_id,plugin_id' }).select().single();
  if (error) throw new HttpError(400, error.message);
  return data;
}
async function uninstall(ctx: Ctx, pluginId: string) {
  const { data: accounts } = await ctx.db.from('connector_accounts').select('id').eq('plugin_id', pluginId);
  for (const a of accounts ?? []) await ctx.db.rpc('disconnect_connector', { p_account_id: a.id, p_delete_data: true });
  await ctx.db.from('plugin_installations').delete().eq('plugin_id', pluginId);
  return { ok: true, disconnected: (accounts ?? []).length };
}

async function callConnector(ctx: Ctx, manifest: PluginManifest, reqBody: ConnectorRequest): Promise<unknown> {
  if (manifest.id === 'linkedin-export') return runLinkedInExport(reqBody);
  if (manifest.id === 'linkedin-api') throw new HttpError(400, "LinkedIn's public API does not expose connections; it can only verify your own profile via Sign in with LinkedIn." + (Deno.env.get('LINKEDIN_CLIENT_ID') ? '' : ' (LINKEDIN_CLIENT_ID is not configured on this deployment.)'));
  if (!manifest.service) throw new HttpError(400, 'plugin has no service');
  const url = new URL(manifest.service.url);
  if (!isAllowedServiceHost(url.hostname, manifest.service.allowedHosts)) throw new HttpError(400, 'connector host not allowed');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), manifest.limits?.timeoutMs ?? 10_000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bridge-protocol': '1' }, body: JSON.stringify(reqBody), signal: ctrl.signal, redirect: 'error' });
    const max = manifest.limits?.maxBytes ?? 5_000_000;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > max) throw new HttpError(502, 'connector response too large');
    const text = await res.text();
    if (text.length > max) throw new HttpError(502, 'connector response too large');
    if (!res.ok) throw new HttpError(502, `connector returned ${res.status}`);
    return JSON.parse(text);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, e instanceof DOMException && e.name === 'AbortError' ? 'connector timed out' : 'connector unreachable or returned invalid JSON');
  } finally { clearTimeout(timer); }
}

async function run(ctx: Ctx, pluginId: string, op: 'preview' | 'import', body: Body) {
  const { manifest } = await manifestFor(ctx, pluginId);
  const { data: inst } = await ctx.db.from('plugin_installations').select('enabled').eq('plugin_id', pluginId).maybeSingle();
  if (!inst?.enabled) throw new HttpError(403, 'install and enable the plugin first');
  if (manifest.auth.type === 'file') {
    if (typeof body.fileText !== 'string') throw new HttpError(400, 'fileText required');
    if (body.fileText.length > (manifest.limits?.maxBytes ?? 5_000_000)) throw new HttpError(413, 'file too large');
  }
  // account row (one per owner+plugin+provider)
  const provider = manifest.id;
  let { data: account } = await ctx.db.from('connector_accounts').select('*').eq('plugin_id', pluginId).eq('provider', provider).maybeSingle();
  if (!account) {
    const ins = await ctx.admin.from('connector_accounts').insert({ owner_id: ctx.user.id, plugin_id: pluginId, provider, display_label: body.fileName ?? manifest.name }).select().single();
    if (ins.error) throw new HttpError(500, ins.error.message);
    account = ins.data;
  }
  const job = await ctx.admin.from('sync_jobs').insert({ owner_id: ctx.user.id, plugin_id: pluginId, account_id: account.id, kind: op, status: 'running', started_at: new Date().toISOString() }).select().single();
  const subjectId = await sha(`${ctx.user.id}:${pluginId}`);
  const limits = { maxRecords: manifest.limits?.maxRecords ?? 5000, maxBytes: manifest.limits?.maxBytes ?? 5_000_000 };
  try {
    const raw = await callConnector(ctx, manifest, { op, context: { pluginId, subjectId, cursor: account.sync_cursor ?? {}, limits }, fileText: body.fileText, fileName: body.fileName });
    const v = validateResponse(raw, pluginId, limits.maxRecords);
    if (!v.ok) throw new HttpError(502, v.error ?? 'connector failed');
    const people = v.records!.filter((r): r is ImportedPerson => r.kind === 'person');
    // Owner↔person edges are recorded on the contact row itself, so only person↔person links are previewed, counted and persisted.
    const edges = v.records!.filter((r): r is ImportedEdge => r.kind === 'edge' && r.fromProviderId !== null);
    // host-enforced semantics: connectors cannot assert personal/colleague relationships as confirmed
    for (const p of people) if (p.relationship === 'personal' || p.relationship === 'colleague') { p.confidence = Math.min(p.confidence, 0.5); (p as ImportedPerson & { needsReview?: boolean }).needsReview = true; }
    const { data: existing } = await ctx.db.from('contacts').select('id, name, email, company, links').eq('archived', false);
    const dupes = detectDuplicates(
      people.map((p, i) => ({ rowIndex: i, displayName: p.name, email: p.email ?? null, phone: null, company: p.company ?? null, title: p.headline ?? null, profileUrl: p.sourceUrl ?? null, city: null, notes: null, skills: [], interests: [], connectedOn: null, howMet: null, warnings: [] })),
      (existing ?? []).map((c) => ({ id: c.id, displayName: c.name, email: c.email, company: c.company, profileUrl: (Array.isArray(c.links) ? (c.links as { url?: string }[]).map((l) => l.url).find((u) => u && u.includes('linkedin.com')) : null) ?? null })),
    );
    const dupeByRow = new Map(dupes.map((d) => [d.rowIndex, d]));
    const preview = people.map((p, i) => ({ ...p, duplicate: dupeByRow.get(i) ?? null }));
    const stats = { people: people.length, edges: edges.length, rejected: v.rejected.length, duplicates: dupes.length, followers: people.filter((p) => p.relationship === 'follower' || p.relationship === 'following').length };
    if (op === 'preview') {
      await ctx.admin.from('sync_jobs').update({ status: 'succeeded', stats, finished_at: new Date().toISOString() }).eq('id', job.data!.id);
      return { jobId: job.data!.id, accountId: account.id, preview, edges, rejected: v.rejected, warnings: v.warnings, stats, manifest };
    }
    const accepted = new Set(Array.isArray(body.accept) ? body.accept : people.map((p) => p.providerId ?? `name:${normalizeName(p.name)}`));
    const result = await persist(ctx, pluginId, account.id, job.data!.id, manifest, people.filter((p) => accepted.has(p.providerId ?? `name:${normalizeName(p.name)}`)), edges, dupeByRow, people);
    await ctx.admin.from('sync_jobs').update({ status: 'succeeded', stats: { ...stats, ...result }, finished_at: new Date().toISOString() }).eq('id', job.data!.id);
    await ctx.admin.from('connector_accounts').update({ last_sync_at: new Date().toISOString(), last_error: null, sync_cursor: v.cursor ?? {}, status: 'connected' }).eq('id', account.id);
    await ctx.db.from('ask_queries').delete().eq('owner_id', ctx.user.id); // cached answers may now be stale
    return { jobId: job.data!.id, accountId: account.id, stats: { ...stats, ...result }, warnings: v.warnings, rejected: v.rejected };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed';
    await ctx.admin.from('sync_jobs').update({ status: 'failed', error: msg, finished_at: new Date().toISOString() }).eq('id', job.data!.id);
    await ctx.admin.from('connector_accounts').update({ last_error: msg, status: 'error' }).eq('id', account.id);
    throw e;
  }
}

async function persist(ctx: Ctx, pluginId: string, accountId: string, jobId: string, manifest: PluginManifest, people: ImportedPerson[], edges: ImportedEdge[], dupes: Map<number, { existingId: string | null; kind: string }>, all: ImportedPerson[]) {
  let created = 0, merged = 0, ambiguous = 0;
  const idByProvider = new Map<string, string>();
  for (const p of people) {
    const idx = all.indexOf(p);
    const dupe = dupes.get(idx);
    const strong = !!dupe?.existingId && (dupe.kind === 'email' || dupe.kind === 'profile_url');
    const rec = await ctx.db.from('import_records').insert({
      owner_id: ctx.user.id, plugin_id: pluginId, account_id: accountId, sync_job_id: jobId, record_type: 'person', provider: pluginId, provider_id: p.providerId ?? null,
      source_url: p.sourceUrl ?? null, retrieved_at: new Date().toISOString(), relationship_type: p.relationship, relationship_direction: p.direction ?? null,
      confidence: p.confidence, payload: p, field_provenance: p.provenance, review_status: strong ? 'merged' : dupe ? 'ambiguous' : 'accepted',
    }).select('id').single();
    if (rec.error) throw new HttpError(500, rec.error.message);
    let contactId: string;
    if (strong) { contactId = dupe!.existingId!; merged++; }
    else if (dupe) { ambiguous++; continue; } // name-only match: leave for identity review, do not merge or create
    else {
      const ins = await ctx.db.from('contacts').insert({
        owner_id: ctx.user.id, name: p.name, first_name: p.firstName ?? null, last_name: p.lastName ?? null, email: p.email ?? null, headline: p.headline ?? '', company: p.company ?? '',
        school: p.school ?? '', location: p.location ?? '', how_met: `Imported from ${manifest.name}`, met_at: p.connectedAt ? p.connectedAt.slice(0, 10) : null,
        relationship: p.relationship, relationship_source: 'plugin', relationship_status: p.relationship === 'personal' || p.relationship === 'colleague' ? 'suggested' : 'confirmed',
        links: p.sourceUrl ? [{ label: manifest.name, url: p.sourceUrl }] : [],
      }).select('id').single();
      if (ins.error) throw new HttpError(500, ins.error.message);
      contactId = ins.data.id; created++;
    }
    await ctx.db.from('import_records').update({ contact_id: contactId }).eq('id', rec.data.id);
    if (p.providerId) idByProvider.set(p.providerId, contactId);
    const ev = await ctx.db.from('evidence').insert({
      owner_id: ctx.user.id, contact_id: contactId, source: 'plugin', excerpt: `${manifest.name}: ${p.headline ?? p.name}${p.company ? ` at ${p.company}` : ''}`,
      import_record_id: rec.data.id, url: p.sourceUrl ?? null, observed_at: new Date().toISOString(), confidence: p.confidence,
    }).select('id').single();
    const evId = ev.data?.id ?? null;
    const claims = [
      ...(p.company ? [{ kind: 'org', tag: normalizeName(p.company).replace(/\s+/g, '-'), label: p.company, status: 'confirmed' }] : []),
      ...(p.headline ? [{ kind: 'role', tag: normalizeName(p.headline).replace(/\s+/g, '-').slice(0, 80), label: p.headline, status: 'confirmed' }] : []),
      ...(p.suggestedTags ?? []).map((t) => ({ kind: t.kind === 'interest' ? 'interest' : 'skill', tag: t.tag, label: t.label, status: 'suggested' })),
    ];
    if (claims.length) await ctx.db.from('contact_claims').insert(claims.map((c) => ({ ...c, owner_id: ctx.user.id, contact_id: contactId, evidence_id: evId })));
  }
  let edgesCreated = 0;
  for (const e of edges) {
    const to = idByProvider.get(e.toProviderId);
    const from = e.fromProviderId === null ? null : idByProvider.get(e.fromProviderId);
    if (!to || (e.fromProviderId !== null && !from) || from === to) continue;
    if (from === null) continue; // owner↔contact relationship is already recorded on the contact row
    const rec = await ctx.db.from('import_records').insert({ owner_id: ctx.user.id, plugin_id: pluginId, account_id: accountId, sync_job_id: jobId, record_type: 'edge', provider: pluginId, confidence: e.confidence, payload: e, field_provenance: { edge: e.provenance }, review_status: 'accepted' }).select('id').single();
    await ctx.db.from('contact_edges').insert({ owner_id: ctx.user.id, from_contact_id: from, to_contact_id: to, kind: e.edgeKind, source: 'plugin', status: 'suggested', import_record_id: rec.data?.id ?? null, note: e.provenance.source });
    edgesCreated++;
  }
  return { created, merged, ambiguous, edgesCreated };
}

async function sha(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
