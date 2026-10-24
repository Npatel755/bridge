# Status, checks and limitations

## Checks run in this build

| Check | Result |
| --- | --- |
| `packages/core` vitest | 38 tests pass |
| `packages/plugin-sdk` vitest | 8 tests pass |
| `supabase/tests` integration (`npm run test:db`) | 8 suites pass: demo load + ownership isolation, RLS/private schema, grounded Ask (citations, follower-only not warm, honest no-match, input limits), team roles/unfilled/edited, note extraction (suggestions only, ambiguous names, injected instructions ignored), plugins (install gate, preview/import LinkedIn export, follower labeling via community connector, disconnect removes data, cross-user denied), nearby (opt-in both sides, accuracy, staleness, two-sample stability, cooldown, no coordinates in payload, blocks decline intros, out of range, disabling ends session), export/delete |
| TypeScript | core, plugin-sdk, mobile pass |
| `deno check` Edge Functions | pass |
| `expo lint` | pass |
| `expo export --platform web` | builds |

## Known limitations

- **No physical devices were available.** Haptics, background location, local notifications, the keyboard dictation path, phone contacts and expo-audio recording are implemented against the SDK 58 APIs but were only exercised on web and by reading the docs. They need a development build (`npx expo run:ios|android`, not Expo Go, because background location and notifications need native config) and a real walk test for Nearby.
- **Nearby was validated with the SQL rules and the labeled simulator**, not with two phones. Background collection on iOS requires the `Always` permission flow and a dev build.
- **No LLM key** was configured, so Ask/Team/Extract ran in the deterministic mode. The LLM path (explanations and embeddings) is implemented with the hash fallback and is labeled in the UI but untested against a provider.
- **Voice:** web dictation uses the Web Speech API where the browser supports it. On native, recordings are captured with expo-audio but not transcribed (no speech service configured); the UI says so and points to keyboard dictation.
- **LinkedIn:** only the export importer works end to end. "Sign in with LinkedIn" verification is scaffolded server-side and disabled without credentials. No scraping.
- **Google sign-in** requires provider configuration; hidden otherwise. Web redirects in-page; native opens the system auth sheet (`expo-web-browser`) and completes the exchange from the `bridge://` redirect. Neither path was exercised without provider credentials.
- **Password recovery** sends a link that lands on `/reset-password` (web origin or `bridge://` on native); the new-password screen was verified on web only.
- **Export on native** copies JSON to the clipboard (no file-sharing module added); web downloads a file.
- Demo contacts and nearby personas are fictional. The web preview runs the same code via react-native-web, so native tab-bar and modal behaviors differ slightly.

## Design notes vs. platform

The UI uses a single token file (`apps/mobile/src/constants/theme.ts`) for colors, type, spacing and radii; shared components (person card, evidence quote with marks, route line, tags, buttons, nearby match card, status row, rings, tab bar, progress, sheet) are used on every screen. Custom top bars replace native headers so web and native match. Lucide icons via `lucide-react-native`.
