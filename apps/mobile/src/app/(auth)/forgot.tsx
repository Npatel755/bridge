import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Platform } from 'react-native';

import { Button, Field, Screen, ScreenHeader, Section } from '@/bridge-design-system';
import { Back, Notice, Stack } from '@/components/shared';
import { errorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true); setError(null);
    try { const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: Platform.OS === 'web' ? `${window.location.origin}/reset-password` : Linking.createURL('/reset-password') }); if (error) throw error; setDone(true); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Screen footer={<Button variant="primary" size="sm" fullWidth label={busy ? 'Sending…' : 'Send reset link'} disabled={busy || !email} onPress={send} />}>
      <ScreenHeader left={<Back />} title="Reset your password" subtitle="We will email you a link to choose a new one." />
      <Section label="Email">
        <Stack>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          {error ? <Notice tone="dangerInk">{error}</Notice> : null}
          {done ? <Notice tone="confirmInk">If that address has an account, a reset email is on its way.</Notice> : null}
        </Stack>
      </Section>
    </Screen>
  );
}
