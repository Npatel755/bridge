import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Notice, Row, Screen, ScreenTitle, T } from '@/components';
import { useTheme } from '@/constants/theme';
import { errorMessage } from '@/lib/api';
import { signInDemo } from '@/lib/demo';
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
    <Screen contentStyle={{ justifyContent: 'center', flexGrow: 1, paddingTop: space[8] }}>
      <ScreenTitle title="Bridge" caption="Tell Bridge what you want to accomplish. It finds the people you already know who can help, shows the evidence, and suggests a next step." />
      {!isConfigured ? <Notice>The backend is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env, then restart the dev server.</Notice> : null}
      <Card>
        <Field label="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" />
        <Field label="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} placeholder="Your password" onSubmitEditing={signIn} />
        {error ? <Notice>{error}</Notice> : null}
        <Button variant="primary" title="Sign in" loading={busy === 'password'} disabled={!email || !password} onPress={signIn} />
        <Row between>
          <Link href="/sign-up" asChild><Button variant="ghost" size="sm" title="Create account" /></Link>
          <Link href="/forgot" asChild><Button variant="ghost" size="sm" title="Forgot password" /></Link>
        </Row>
        {googleEnabled ? <Button title="Continue with Google" loading={busy === 'google'} onPress={() => run('google', async () => { const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' }); if (error) throw error; })} /> : null}
      </Card>
      <View style={{ gap: space[2], marginTop: space[3] }}>
        <T variant="label" color="inkSoft">Try the demo</T>
        <T variant="caption" color="inkSoft">A fictional account with about 40 cards, notes, plugin imports, and a nearby simulator labeled as such. Local stack only.</T>
        <Button title="Open the demo account" loading={busy === 'demo'} onPress={() => run('demo', signInDemo)} />
      </View>
    </Screen>
  );
}

function friendly(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'That email and password do not match. Check them and try again.';
  if (/fetch|network/i.test(msg)) return 'Could not reach the server. Check that Supabase is running and the URL in .env is reachable from this device.';
  return msg;
}
