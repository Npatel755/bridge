# Bridge

Tell Bridge what you want to accomplish. It finds the people you already know who can help, explains why with quoted evidence, and suggests your next step.

Hackathon MVP: Expo (React Native, TypeScript, Expo Router) on top of Supabase (Auth, Postgres, PostGIS, pgvector, Row Level Security, Edge Functions). Matching logic lives in a pure TypeScript package with tests, separate from UI and device adapters.

- [Architecture](docs/ARCHITECTURE.md) · [Demo script](docs/DEMO.md) · [Plugins & connector SDK](docs/PLUGINS.md) · [Status, checks and limitations](docs/STATUS.md)

## What it does

- **Ask your network.** “Who do I know who can help prototype a smart bike light?” returns people from your own cards, each with how you know them, why they match, the quoted evidence and its date, the route (direct, possible intro via someone, or unconfirmed), a suggested ask, and what is uncertain. No supported match is reported honestly. Works without an AI key using a labeled keyword engine.
- **Network memory.** Private cards for people you know: notes (typed or dictated), skills, interests, goals, organizations, reminders, relationships with source and confirmation status. CSV import with column mapping and duplicate review; selected phone contacts; LinkedIn export import.
- **Note extraction.** Names, skills, interests, organizations and “X knows Y” links are suggested from a note and nothing is saved until you confirm. Ambiguous names (“Which Jordan?”) are asked about, not guessed.
- **Build my team.** A project description becomes roles; each role gets people from your cards or an honest “no one yet” with next steps. Roles are editable. Reciprocal opportunities (“you could help them”) are surfaced from recorded goals.
- **Graph and outreach.** List and graph views of your cards with route styling (direct / intro / unconfirmed), filters by skill, org and goal, and editable outreach drafts you copy or open in Mail or Messages. Bridge never sends anything.
- **Nearby.** Opt-in, both sides on, shared skill *and* interest required, coarse distance bands only, fresh (≤2 min) and accurate (≤50 m) samples, two stable samples, per-person cooldown and burst limits, mute/block/report, smaller radius wins, presence deleted on opt-out. Raw location lives in a restricted schema. A clearly labeled simulator demonstrates the rules.
- **Plugins.** Manifest-validated connectors run as server-side services talking JSON; nothing plugin-authored runs in the app. LinkedIn export importer, a community example connector, a starter template and a fixture test runner.
- **Privacy and account.** Owner-scoped RLS on every table, server-side rate limits and validation, export and delete.

## Run it locally

Prerequisites: Node 22, Docker, the [Supabase CLI](https://supabase.com/docs/guides/cli), and (optional) Deno for Edge Function typechecks.

```bash
npm install
supabase start                      # Postgres + Auth + Studio in Docker
supabase db reset                   # applies migrations and seeds the demo account
cp supabase/functions/.env.example supabase/functions/.env
supabase functions serve --env-file supabase/functions/.env --no-verify-jwt   # keep running
cp apps/mobile/.env.example apps/mobile/.env   # local anon key is pre-filled; `supabase status` shows it
cd apps/mobile && npx expo start                # press w for web, or scan with Expo Go
```

Sign in with **Open the demo account** on the sign-in screen (credentials are the fictional ones created by `supabase/seed.sql`, see `apps/mobile/src/lib/demo.ts`), then **Load the demo network** on Home.

On a physical phone, `127.0.0.1` points at the phone. Put your computer's LAN IP in `EXPO_PUBLIC_SUPABASE_URL` (e.g. `http://192.168.1.20:54321`) and restart Expo.

Optional keys (all in `supabase/functions/.env`): `LLM_API_KEY` enables LLM-written explanations and real embeddings (results stay grounded in your cards; the UI labels the mode). `LINKEDIN_CLIENT_ID/SECRET` enable "Sign in with LinkedIn" profile verification. Google sign-in: configure the provider in Supabase and set `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true`.

Want it on a phone without Expo Go? See [docs/SIDELOAD.md](docs/SIDELOAD.md): host the backend on Supabase, build an unsigned IPA with the included GitHub Actions workflow, and sideload it with Sideloadly.

## Checks

```bash
npm run typecheck          # core, plugin-sdk, mobile
npm run lint               # expo lint
npm test                   # core (vitest) + plugin-sdk (vitest)
npm run test:db            # integration tests against the local stack (RLS isolation, ask, team, extraction, plugins, nearby rules, export/delete)
npm run plugin:test        # validate every plugin manifest and fixture
npm run sync:functions && (cd supabase/functions && deno check */index.ts)
cd apps/mobile && npx expo export --platform web && cd ../.. && npm run web:serve
```

## Repository layout

```
apps/mobile            Expo app (Expo Router routes in src/app, components, lib adapters)
packages/core          Pure matching logic: ask, team, paths, reciprocal, extraction, CSV, nearby rules, outreach, embeddings
packages/plugin-sdk    Manifest schema, connector protocol, validation, fixture runner
plugins/               linkedin-export, community-example, template
supabase/migrations    Schema, RLS, PostGIS nearby, pgvector, plugins, account/demo functions
supabase/functions     Edge Functions: ask, team, extract-note, plugins (host), account
supabase/seed.sql      Fictional demo account, ~40 contacts, nearby personas, plugin registry
supabase/tests         node --test integration suite
docs/                  Architecture, demo script, plugins, status and limitations
```
