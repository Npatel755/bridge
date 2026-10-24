import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Field, Notice, Screen, ScreenTitle, TopBar } from '@/components';
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
    <>
      <TopBar title="New password" />
      <Screen cta={<Button variant="primary" size="lg" title="Save password" loading={busy} disabled={!ready} onPress={save} />}>
        <ScreenTitle title="Choose a new password" caption="You opened a password reset link. Pick a new password of at least 8 characters to finish signing in." />
        <Card>
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
          <Field label="Repeat it" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" hint={mismatch ? 'These do not match yet.' : undefined} />
          {error ? <Notice>{error}</Notice> : null}
        </Card>
        <Button variant="ghost" title="Skip for now" onPress={() => { clearRecovery(); router.replace('/'); }} />
      </Screen>
    </>
  );
}
