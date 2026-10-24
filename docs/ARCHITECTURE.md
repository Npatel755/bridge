# Architecture

## Layers

```
┌──────────────── apps/mobile (Expo, Expo Router) ────────────────┐
│ screens → shared components (design tokens in constants/theme.ts) │
│ lib/: supabase client, session, api (Edge Function calls),        │
│       nearby (expo-location / task-manager / notifications),       │
│       voice (Web Speech / expo-audio), haptics                     │
└───────────────┬───────────────────────────────────┬──────────────┘
                │ supabase-js (RLS-scoped)          │ functions.invoke (JWT)
┌───────────────▼────────────┐        ┌─────────────▼──────────────────────┐
│ Postgres (Supabase)        │        │ Edge Functions (Deno)              │
│ public.*  owner-scoped RLS │◄───────│ ask · team · extract-note          │
│ private.* presence, creds  │ service│ plugins (connector host) · account  │
│ PostGIS nearby_publish     │  role  │ _shared/core = packages/core (sync) │
│ pgvector match_contacts    │        │ optional LLM adapter, hash fallback │
└────────────────────────────┘        └─────────────┬──────────────────────┘
                                                    │ validated JSON over HTTPS
                                      ┌─────────────▼──────────────┐
                                      │ Connector services         │
                                      │ (plugins/*, isolated)      │
                                      └────────────────────────────┘
```

`packages/core` has no I/O. The Edge Functions map database rows into core types (`db-map.ts`), run the deterministic engine, optionally ask an LLM to *rewrite explanations only*, and re-ground the output. `scripts/sync-functions-shared.mjs` copies core and the plugin SDK into `supabase/functions/_shared` (generated, not edited by hand).

## Data model (public schema, all owner-scoped)

profiles, profile_tags (skills/tools/interests/goals/offers with `discoverable`), profile_entries · contacts, notes, evidence, contact_claims, contact_edges, reminders, interactions · ask_queries, project_requests, outreach_drafts, contact_embeddings (vector(256)) · discovery_prefs, discovery_sessions, match_events, blocks, mutes, reports, intro_requests, notification_state · plugins, plugin_manifests, plugin_installations, connector_accounts, sync_jobs, import_records, rate_limits.

Restricted `private` schema (no API access): presence (exact geography), presence_pairs (stability streaks), connector_credentials, oauth_states.

Every claim about a person points at an `evidence` row with `source` (self_reported, manual, note, csv_import, phone_contacts, plugin, extracted, ai_suggested, demo), excerpt, date and confidence. Claims and edges carry `status` confirmed / suggested / rejected. Imported records keep provider id, source URL, retrieval date, relationship type and direction, field provenance and confidence.

## Grounded matching

`askNetwork(query, contacts, edges, { semantic })` in core: parse the goal into canonical tags (taxonomy with synonyms), score each contact on expertise (exact and related tags, evidence weight, staleness), relationship strength, access (direct route or a supported intro path through confirmed/suggested edges), evidence quality and recency. Followers/following and same-school/company are never warm routes. Each recommendation carries citations, route, suggested ask and uncertainties. If nothing clears the evidence bar, status is `no_supported_match` with next steps. Semantic scores from pgvector (or an in-memory hash fallback) only add to candidates that already have evidence.

## Nearby

Client samples location (foreground `watchPositionAsync`, optional background `startLocationUpdatesAsync` task). Each sample goes to `nearby_publish()` which enforces: enabled prefs, active unexpired session, simulated vs real mode, freshness ≤120 s, accuracy ≤50 m, rate limit, both sides opted in and with discoverable tags, no block, shared skill **and** interest, distance within the smaller radius, audience, mute, two-sample stability, per-person cooldown and burst limit. It returns match event ids; `match_payload()` returns only the coarse band and discoverable profile fields. `nearby_stop()` and disabling prefs delete presence. The simulator runs in a `simulated` session and is labeled in the UI.

## Plugins

A manifest (id, version, capabilities, auth type, service URL, limits, limitations text) is validated server-side (HTTPS only, no private hosts, size/timeout/rate limits). The `plugins` Edge Function calls the connector with a JSON request, validates every record with the SDK (control characters stripped, URLs checked, relationship types constrained), de-duplicates against the user's cards, previews, and writes `import_records` + contacts/evidence/claims/edges with provenance. Personal/colleague relationships from connectors are downgraded to suggestions. Disconnect removes credentials and import-only cards.

## Security

RLS on every public table using `auth.uid()`. Edge Functions authenticate the bearer JWT, use an RLS-scoped client for user data and a service client only for rate limits and job bookkeeping. Imported and note text is treated as untrusted data (and fenced when passed to an LLM). Rate limits per user per bucket. Export and delete are SQL functions callable only by the owner.
