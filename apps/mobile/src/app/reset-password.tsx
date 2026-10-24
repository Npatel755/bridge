import { router } from 'expo-router';
import { useState } from 'react';

import { BText, Button, Field, Screen, ScreenHeader, Section } from '@/bridge-design-system';
import { Notice, Stack } from '@/components/shared';
import { errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function ResetPassword() {
  const { clearRecovery } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= 8 && confirm === password;

  async function save() {
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      clearRecovery();
      router.replace('/');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Screen footer={<Button variant="primary" size="sm" fullWidth label={busy ? 'Saving…' : 'Save password'} disabled={busy || !ready} onPress={save} />}>
      <ScreenHeader title="Choose a new password" subtitle="You opened a password reset link. Pick a new password of at least 8 characters to finish signing in." right={<Button variant="ghost" size="sm" label="Skip for now" onPress={() => { clearRecovery(); router.replace('/'); }} />} />
      <Section label="New password">
        <Stack>
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
          <Field label="Repeat it" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
          {mismatch ? <BText variant="caption" color="cautionInk">These do not match yet.</BText> : null}
          {error ? <Notice tone="dangerInk">{error}</Notice> : null}
        </Stack>
      </Section>
    </Screen>
  );
}
