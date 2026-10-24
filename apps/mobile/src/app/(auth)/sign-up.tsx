import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Field, Notice, Screen, ScreenTitle, TopBar } from '@/components';
import { errorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() } } });
      if (error) throw error;
      if (!data.session) setSent(true);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <TopBar onBack={() => router.back()} />
      <Screen cta={<Button variant="primary" size="lg" title="Create account" loading={busy} disabled={!name || !email || password.length < 8} onPress={submit} />}>
        <ScreenTitle title="Create your account" caption="Your cards and notes stay private to you. Only the profile fields you mark as discoverable are ever shown to other people." />
        <Card>
          <Field label="Name" value={name} onChangeText={setName} autoComplete="name" placeholder="Your name" />
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint="At least 8 characters" />
          {error ? <Notice>{error}</Notice> : null}
          {sent ? <Notice tone="confirm">Check your email to confirm your address, then sign in.</Notice> : null}
        </Card>
      </Screen>
    </>
  );
}
