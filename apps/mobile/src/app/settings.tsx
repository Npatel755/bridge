import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { BText, Button, EmptyRow, Group, Row, Screen, ScreenHeader, Section } from '@/bridge-design-system';
import { Back, Loading, Notice, Stack } from '@/components/shared';
import { useAsync } from '@/hooks/use-async';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface Persona { key: string; display_name: string; note: string; nearby_enabled: boolean; blocked: boolean; shares_skill: boolean; shares_interest: boolean; offset_m: number; accuracy_m: number; radius_m: number }

export default function Settings() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { session, profile, signOut } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const blocks = useAsync(async () => { const { data, error } = await supabase.rpc('blocked_people'); if (error) throw error; return (data ?? []) as { blocked_id: string; display_name: string; created_at: string }[]; });
  const archived = useAsync(async () => (await supabase.from('contacts').select('id, name').eq('archived', true)).data ?? []);
  const personas = useAsync(async () => (profile?.is_demo ? ((await supabase.rpc('demo_persona_report')).data as Persona[] | null) ?? [] : []), [profile?.is_demo]);

  async function exportData() {
    setBusy('export'); setError(null);
    try {
      const data = await api.exportAccount();
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') { const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'bridge-export.json'; a.click(); URL.revokeObjectURL(url); setMsg('Downloaded bridge-export.json.'); }
      else { await Clipboard.setStringAsync(json); setMsg(`Copied ${Math.round(json.length / 1024)} KB of JSON to the clipboard. Paste it into a file to keep it.`); }
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }
  async function deleteAccount() {
    setBusy('delete'); setError(null);
    try { await api.deleteAccount(); } catch (e) { setError(errorMessage(e)); setBusy(null); return; }
    // The server-side user is gone; drop the local session even if the sign-out call itself fails.
    try { await signOut(); } catch { await supabase.auth.signOut({ scope: 'local' }).catch(() => {}); }
  }

  return (
    <Screen>
      <ScreenHeader left={<Back />} title="Settings and data" subtitle={session?.user.email ?? ''} />
      {error ? <Notice tone="dangerInk">{error}</Notice> : null}
      {msg ? <Notice tone="confirmInk">{msg}</Notice> : null}

      {profile?.is_demo && (section === 'personas' || personas.data?.length) ? (
        <Section label="Demo simulator personas">
          <Stack>
            <BText variant="secondary" color="inkSoft">Each fictional persona shows one rule. Only the first can match.</BText>
            {personas.loading ? <Loading /> : (
              <Group>
                {personas.data?.map((p) => {
                  const ok = p.nearby_enabled && !p.blocked && p.shares_skill && p.shares_interest && p.accuracy_m <= 50 && p.offset_m <= Math.min(p.radius_m, 100);
                  return <Row key={p.key} title={p.display_name} titleVariant="rowName" overline={`${ok ? 'Can match' : 'Cannot match'} · ${p.note}`} subtitle={`${p.offset_m} m away · accuracy ${p.accuracy_m} m · radius ${p.radius_m} m · nearby ${p.nearby_enabled ? 'on' : 'off'} · ${p.shares_skill ? 'shares a skill' : 'no shared skill'} · ${p.shares_interest ? 'shares an interest' : 'no shared interest'}${p.blocked ? ' · blocked' : ''}`} />;
                })}
              </Group>
            )}
          </Stack>
        </Section>
      ) : null}

      <Section label="Your data">
        <Group>
          <Row title="Export my data as JSON" titleVariant="label" subtitle={busy === 'export' ? 'Preparing…' : 'Profile, cards, notes, evidence, drafts, nearby settings, plugin records. Raw location is never stored long enough to export.'} chevron onPress={() => { if (!busy) exportData(); }} />
          <Row title={confirmDelete ? 'Tap again to delete everything' : 'Delete my account'} titleVariant="label" subtitle={confirmDelete ? (busy === 'delete' ? 'Deleting…' : 'Removes profile, cards, notes, presence and sign-in right away. Export first if you want a copy.') : 'Cannot be undone.'} onPress={() => { if (busy) return; if (confirmDelete) deleteAccount(); else setConfirmDelete(true); }} />
          {confirmDelete ? <Row title="Keep my account" titleVariant="label" onPress={() => setConfirmDelete(false)} /> : null}
        </Group>
      </Section>

      <Section label="Blocked people">
        {blocks.data?.length ? (
          <Group>{blocks.data.map((b) => <Row key={b.blocked_id} title={b.display_name} titleVariant="rowName" trailing={<Button variant="ghost" size="sm" label="Unblock" onPress={async () => { await supabase.from('blocks').delete().eq('blocked_id', b.blocked_id); blocks.reload(); }} />} />)}</Group>
        ) : <EmptyRow title="No one blocked. Blocking stops Nearby matches and intro requests both ways." />}
      </Section>

      <Section label="Archived cards">
        {archived.data?.length ? (
          <Group>{archived.data.map((c) => <Row key={c.id} title={c.name} titleVariant="rowName" trailing={<Button variant="ghost" size="sm" label="Restore" onPress={async () => { await supabase.from('contacts').update({ archived: false }).eq('id', c.id); archived.reload(); }} />} />)}</Group>
        ) : <EmptyRow title="No archived cards." />}
      </Section>

      <Section label="About">
        <Stack>
          <BText variant="secondary" color="inkSoft">Bridge keeps matching logic on the server and in a tested core package. Ask and team results come from your own cards and notes. Without an AI key, searches use keyword rules and are labeled that way. Nearby shares only coarse distance bands; exact coordinates stay on the server and are deleted when you turn it off.</BText>
          <Button size="sm" fullWidth label="Sign out" onPress={signOut} />
        </Stack>
      </Section>
    </Screen>
  );
}
