# Put Bridge on an iPhone (sideloading)

Bridge needs a backend the phone can reach, so a sideloaded build uses a hosted Supabase project instead of `supabase start` on your laptop. Three steps: host the backend, build the IPA, sideload it.

## 1. Host the backend (once, ~10 minutes)

1. Create a free project at [supabase.com](https://supabase.com) and note the **Project URL** and **anon (publishable) key** from *Project Settings → API*.
2. From this repo, with the [Supabase CLI](https://supabase.com/docs/guides/cli) logged in:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push                                   # applies supabase/migrations
   psql "$(supabase db url 2>/dev/null || echo '<connection string from Settings → Database>')" -f supabase/seed.sql   # demo account + fictional network
   supabase functions deploy ask team extract-note plugins account
   supabase secrets set LLM_API_KEY=... LLM_MODEL=... LLM_EMBED_MODEL=...   # optional; without it Bridge runs in the labeled deterministic mode
   ```

3. In the dashboard, *Authentication → URL Configuration*: add `bridge://**` to **Redirect URLs** (password recovery and Google sign-in open the app directly). Keep **Confirm email** on for a real deployment; turn it off only for a demo phone.
4. If you want the Google button, configure the Google provider under *Authentication → Providers* and build with `google_auth=true` below.

## 2. Build the IPA

The repo ships a GitHub Actions workflow (`.github/workflows/ios-ipa.yml`) that runs on a macOS runner, generates the native project with `expo prebuild`, archives it **without code signing**, and uploads `Bridge-unsigned.ipa` as a workflow artifact. Nothing Apple-specific is needed on your side; Sideloadly signs the app with your Apple ID.

```bash
gh workflow run ios-ipa.yml --ref <branch> \
  -f supabase_url=https://<project-ref>.supabase.co \
  -f supabase_anon_key=<anon key>
gh run watch            # ~15–30 minutes
gh run download --name Bridge-unsigned-ipa
```

Or use the *Actions → iOS IPA* tab in GitHub and fill in the same two fields. The anon key is a public client key by design; row-level security protects the data.

## 3. Sideload with Sideloadly

1. Install [Sideloadly](https://sideloadly.io) on your computer and connect the iPhone with a cable (enable *Trust this computer*).
2. Drag `Bridge-unsigned.ipa` into Sideloadly, enter your Apple ID, press **Start**.
3. On the phone: *Settings → General → VPN & Device Management*, trust the developer profile for your Apple ID, then open Bridge.

### What to expect on a free Apple ID

- The signature lasts **7 days**; re-run Sideloadly to refresh it (Sideloadly can do this over Wi‑Fi). Paid developer accounts get a year.
- **Local notifications, haptics, location, contacts and the microphone work.** Background Nearby needs the *Always* location permission, which iOS asks for after the first *While Using* grant.
- **Push entitlements are not available** on free accounts; Bridge only uses local notifications, so nothing is lost.
- The bundle id is `app.bridge.mobile`; Sideloadly may rewrite it to a per-Apple-ID variant, which is fine.

### First run

Sign in with **Open the demo account** (fictional data from `supabase/seed.sql`) or create your own account. Everything the web demo does works on the phone; the native-only paths (haptics, background location, notification taps, phone contacts, voice notes) are exercised here for the first time, so report anything odd.
