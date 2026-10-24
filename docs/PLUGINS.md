# Plugins and the connector SDK

Bridge imports people from outside sources through **connectors**: small HTTPS services that speak a validated JSON protocol. They run on a server you control, never inside the mobile app. The Edge Function `plugins` is the host.

## What ships

| Plugin | Kind | What it does | Honest limits |
| --- | --- | --- | --- |
| `linkedin-export` | built in, file | Imports LinkedIn's `Connections.csv` (name, title, company, profile URL, connected-on) as *mutual connections* | No skills, no followers, not live. Titles become **suggested** tags, never confirmed expertise. |
| `linkedin-api` | built in, OAuth | Sign in with LinkedIn to verify your own profile | LinkedIn's API does not expose connections. Disabled unless `LINKEDIN_CLIENT_ID` is set. No scraping. |
| `community-example` | community, service | Fixture service showing followers vs following vs people you know, provenance, and intentionally invalid records | Demo data only. |
| `template` | starter | Copy to build your own | — |

## Protocol (packages/plugin-sdk)

Request: `{ op: 'preview' | 'import', context: { pluginId, subjectId, cursor, limits }, fileText?, fileName? }`.
Response: `{ protocol: 1, records: ImportedRecord[], cursor?, warnings? }` where a record is a `person` (providerId, name, headline, company, relationship ∈ personal | colleague | mutual_connection | follower | following | unknown, direction, confidence, sourceUrl, retrievedAt, suggestedTags, field provenance) or an `edge` (from/to provider ids, edgeKind, provenance).

Host guarantees: manifest validated (`validateManifest`), HTTPS and public hosts only, response size/timeout/record caps, every record validated (`validateResponse`: control characters stripped, URLs must be http(s), confidence clamped), follower/following never treated as warm routes or expertise, personal/colleague claims downgraded to *suggested* until the user confirms, strong duplicates (email or profile URL) merge, name-only duplicates wait for identity review, provenance stored on `import_records`, cached Ask results invalidated, disconnect deletes credentials and import-only cards.

## Build one

1. `cp -r plugins/template plugins/my-connector`, edit `manifest.json` (id, version, capabilities, auth, service URL, limits, limitations).
2. Implement `server.mjs` (or any language): accept the request, return validated records. Keep provider ids stable so re-imports merge.
3. Add fixtures and run `npm run plugin:test` — it validates the manifest and fixtures and warns about relationship claims that need review.
4. Register: insert the manifest into `public.plugins` (see `supabase/seed.sql`). Community plugins are `kind = 'community'` and can be disabled or revoked centrally.
