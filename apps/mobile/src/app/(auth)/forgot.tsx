import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Field, Notice, Screen, ScreenTitle, TopBar } from '@/components';
import { errorMessage } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <TopBar onBack={() => router.back()} />
      <Screen cta={<Button variant="primary" size="lg" title="Send reset link" loading={busy} disabled={!email} onPress={async () => {
        setBusy(true); setError(null);
        try { const { error } = await supabase.auth.resetPasswordForEmail(email.trim()); if (error) throw error; setDone(true); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
      }} />}>
        <ScreenTitle title="Reset your password" caption="We will email you a link to choose a new one." />
        <Card>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          {error ? <Notice>{error}</Notice> : null}
          {done ? <Notice tone="confirm">If that address has an account, a reset email is on its way.</Notice> : null}
        </Card>
      </Screen>
    </>
  );
}
