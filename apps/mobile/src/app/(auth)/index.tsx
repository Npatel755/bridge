import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { BText, Button, Field, Screen, ScreenHeader, Section, useTheme } from '@/bridge-design-system';
import { Notice, Stack } from '@/components/shared';
import { errorMessage } from '@/lib/api';
import { signInDemo } from '@/lib/demo';
import { signInWithGoogle } from '@/lib/oauth';
import { isConfigured, supabase } from '@/lib/supabase';

const googleEnabled = process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === 'true';

export default function SignIn() {
  const { space } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'demo' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<unknown>) {
    setBusy(kind); setError(null);
    try { await fn(); } catch (e) { setError(friendly(errorMessage(e))); } finally { setBusy(null); }
  }
  const signIn = () => run('password', async () => { const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error; });

  return (
    <Screen>
      <View style={{ paddingTop: space[8] }}>
        <ScreenHeader title="Bridge" subtitle="Tell Bridge what you want to accomplish. It finds the people you already know who can help, shows the evidence, and suggests a next step." />
      </View>
      {!isConfigured ? <Notice tone="cautionInk">The backend is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env, then restart the dev server.</Notice> : null}
      <Section label="Sign in">
        <Stack>
          <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" />
          <Field label="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} placeholder="Your password" onSubmitEditing={signIn} />
          {error ? <Notice tone="dangerInk">{error}</Notice> : null}
          <Button variant="primary" size="sm" fullWidth label={busy === 'password' ? 'Signing in…' : 'Sign in'} disabled={!!busy || !email || !password} onPress={signIn} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Button variant="ghost" size="sm" label="Create account" onPress={() => router.push('/sign-up')} />
            <Button variant="ghost" size="sm" label="Forgot password" onPress={() => router.push('/forgot')} />
          </View>
          {googleEnabled ? <Button size="sm" fullWidth label={busy === 'google' ? 'Opening Google…' : 'Continue with Google'} disabled={!!busy} onPress={() => run('google', signInWithGoogle)} /> : null}
        </Stack>
      </Section>
      <Section label="Try the demo">
        <Stack>
          <BText variant="secondary" color="inkSoft">A fictional account with about 40 cards, notes, plugin imports, and a nearby simulator labeled as such.</BText>
          <Button size="sm" fullWidth label={busy === 'demo' ? 'Opening…' : 'Open the demo account'} disabled={!!busy} onPress={() => run('demo', signInDemo)} />
        </Stack>
      </Section>
    </Screen>
  );
}

function friendly(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'That email and password do not match. Check them and try again.';
  if (/fetch|network/i.test(msg)) return 'Could not reach the server. Check that Supabase is running and the URL in .env is reachable from this device.';
  return msg;
}
