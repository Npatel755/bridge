import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Card, Flag, Loading, Notice, Row, Screen, ScreenTitle, Sheet, T, TopBar } from '@/components';
import { useTheme } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface Persona { key: string; display_name: string; note: string; nearby_enabled: boolean; blocked: boolean; shares_skill: boolean; shares_interest: boolean; offset_m: number; accuracy_m: number; radius_m: number }

export default function Settings() {
  const { space } = useTheme();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { session, profile, signOut } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const blocks = useAsync(async () => (await supabase.from('blocks').select('blocked_id, created_at, p:profiles!blocks_blocked_id_fkey(display_name)')).data ?? []);
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
    try { await api.deleteAccount(); await signOut(); } catch (e) { setError(errorMessage(e)); setBusy(null); }
  }

  return (
    <>
      <TopBar onBack={() => router.back()} title="Settings" />
      <Screen>
        <ScreenTitle title="Settings and data" caption={session?.user.email ?? ''} />
        {error ? <Notice>{error}</Notice> : null}
        {msg ? <Notice tone="confirm">{msg}</Notice> : null}

        {profile?.is_demo && (section === 'personas' || personas.data?.length) ? (
          <Card>
            <Flag label="Demo simulator personas" tone="nearby" />
            <T variant="body" color="inkSoft">Each fictional persona shows one rule. Only the first can match.</T>
            {personas.loading ? <Loading /> : personas.data?.map((p) => (
              <View key={p.key} style={{ gap: 2, paddingVertical: space[1] }}>
                <Row between><T variant="name">{p.display_name}</T><T variant="caption" color={p.nearby_enabled && !p.blocked && p.shares_skill && p.shares_interest && p.accuracy_m <= 50 && p.offset_m <= Math.min(p.radius_m, 100) ? 'confirmInk' : 'cautionInk'}>{p.note}</T></Row>
                <T variant="caption" color="inkSoft">{p.offset_m} m away · accuracy {p.accuracy_m} m · radius {p.radius_m} m · nearby {p.nearby_enabled ? 'on' : 'off'} · {p.shares_skill ? 'shares a skill' : 'no shared skill'} · {p.shares_interest ? 'shares an interest' : 'no shared interest'}{p.blocked ? ' · blocked' : ''}</T>
              </View>
            ))}
          </Card>
        ) : null}

        <T variant="title">Your data</T>
        <Card>
          <T variant="body">Export everything Bridge holds for you: profile, cards, notes, evidence, drafts, nearby settings, and plugin records. Raw location is never stored long enough to export.</T>
          <Button title="Export my data as JSON" loading={busy === 'export'} onPress={exportData} />
        </Card>
        <Card>
          <T variant="body">Deleting your account removes your profile, cards, notes, presence, and sign-in. This cannot be undone.</T>
          <Button variant="danger" title="Delete my account" onPress={() => setConfirmDelete(true)} />
        </Card>

        <T variant="title" style={{ marginTop: space[2] }}>Blocked people</T>
        {blocks.data?.length ? blocks.data.map((b) => (
          <Row key={b.blocked_id} between><T variant="body">{(b as unknown as { p: { display_name: string } | null }).p?.display_name ?? 'Someone'}</T><Button variant="ghost" size="sm" title="Unblock" onPress={async () => { await supabase.from('blocks').delete().eq('blocked_id', b.blocked_id); blocks.reload(); }} /></Row>
        )) : <T variant="caption" color="inkSoft">No one blocked. Blocking stops Nearby matches and intro requests both ways.</T>}

        <T variant="title" style={{ marginTop: space[2] }}>Archived cards</T>
        {archived.data?.length ? archived.data.map((c) => (
          <Row key={c.id} between><T variant="body">{c.name}</T><Button variant="ghost" size="sm" title="Restore" onPress={async () => { await supabase.from('contacts').update({ archived: false }).eq('id', c.id); archived.reload(); }} /></Row>
        )) : <T variant="caption" color="inkSoft">No archived cards.</T>}

        <T variant="title" style={{ marginTop: space[2] }}>About</T>
        <T variant="caption" color="inkSoft">Bridge keeps matching logic on the server and in a tested core package. Ask and team results come from your own cards and notes. Without an AI key, searches use keyword rules and are labeled that way. Nearby shares only coarse distance bands; exact coordinates live in a restricted table and are deleted when you turn it off.</T>
        <Button title="Sign out" onPress={signOut} style={{ marginTop: space[2] }} />

        <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account?">
          <T variant="body" color="inkSoft">Everything is removed right away, including the sign-in. Export first if you want a copy.</T>
          <Button variant="danger" title="Delete everything" loading={busy === 'delete'} onPress={deleteAccount} />
        </Sheet>
      </Screen>
    </>
  );
}
