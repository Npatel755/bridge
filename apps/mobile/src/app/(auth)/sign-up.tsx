import { useState } from 'react';

import { BText, Button, Field, Screen, ScreenHeader, Section } from '@/bridge-design-system';
import { Back, Notice, Stack } from '@/components/shared';
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
    <Screen footer={<Button variant="primary" size="sm" fullWidth label={busy ? 'Creating…' : 'Create account'} disabled={busy || !name || !email || password.length < 8} onPress={submit} />}>
      <ScreenHeader left={<Back />} title="Create your account" subtitle="Your cards and notes stay private to you. Only the profile fields you mark as discoverable are ever shown to other people." />
      <Section label="Account">
        <Stack>
          <Field label="Name" value={name} onChangeText={setName} autoComplete="name" placeholder="Your name" />
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="At least 8 characters" />
          <BText variant="caption" color="inkFaint">At least 8 characters.</BText>
          {error ? <Notice tone="dangerInk">{error}</Notice> : null}
          {sent ? <Notice tone="confirmInk">Check your email to confirm your address, then sign in.</Notice> : null}
        </Stack>
      </Section>
    </Screen>
  );
}
