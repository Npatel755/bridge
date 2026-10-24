import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, CardSection, EntryCard, Flag, Loading, Notice, Row, Screen, ScreenTitle, T, Tag, TagRow } from '@/components';
import { useTheme } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { errorMessage } from '@/lib/api';
import { clearDemoData, loadDemoNetwork } from '@/lib/demo';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface PTag { id: string; kind: string; tag: string; label: string; status: string; discoverable: boolean; source: string }
const KIND_LABEL: Record<string, string> = { skill: 'Skills', tool: 'Tools', interest: 'Interests', goal: 'Goals', offer: 'What you can offer' };

export default function Profile() {
  const { space } = useTheme();
  const { profile, signOut, refreshProfile } = useSession();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const tags = useAsync(async () => {
    const { data, error } = await supabase.from('profile_tags').select('id, kind, tag, label, status, discoverable, source').neq('status', 'rejected').order('kind').order('label');
    if (error) throw error;
    return (data ?? []) as PTag[];
  });
  const reload = tags.reload;
  useFocusEffect(useCallback(() => { reload(); refreshProfile(); }, [reload, refreshProfile]));
  const shown = (tags.data ?? []).filter((t) => t.discoverable && t.status === 'confirmed');
  const role = [profile?.role_title, profile?.company || profile?.school].filter(Boolean).join(', ');
  const toggle = async (t: PTag) => { await supabase.from('profile_tags').update({ discoverable: !t.discoverable }).eq('id', t.id); reload(); };
  const confirmTag = async (t: PTag, status: 'confirmed' | 'rejected') => { await supabase.from('profile_tags').update({ status }).eq('id', t.id); reload(); };

  if (!profile) return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <ScreenTitle title={profile.display_name || 'Your card'} caption="Only what is shown on the card below is visible to people you match with. Your email, cards, and notes are never shown." right={<Button variant="ghost" size="sm" title="Edit" onPress={() => router.push('/onboarding?edit=1')} />} />
      <T variant="label" color="inkSoft">How your card looks to others</T>
      <EntryCard name={profile.display_name || 'You'} role={role || 'Add a role and company'} letter={(profile.display_name.trim().split(/\s+/).pop()?.[0] ?? 'Y').toUpperCase()}>
        <CardSection>
          {profile.bio ? <T variant="note">{profile.bio}</T> : <T variant="caption" color="inkSoft">No bio yet.</T>}
          <TagRow>{shown.length ? shown.slice(0, 8).map((t) => <Tag key={t.id} label={t.label} />) : <T variant="caption" color="inkSoft">No discoverable tags. Nearby needs at least one skill and one interest shown here.</T>}</TagRow>
        </CardSection>
      </EntryCard>
      <T variant="caption" color="inkSoft">{[profile.city, profile.industry, profile.career_stage].filter(Boolean).join(' · ')}</T>

      {Object.entries(KIND_LABEL).map(([kind, title]) => {
        const list = (tags.data ?? []).filter((t) => t.kind === kind);
        if (!list.length) return null;
        return (
          <View key={kind} style={{ gap: space[2], marginTop: space[2] }}>
            <Row between><T variant="title">{title}</T><T variant="caption" color="inkSoft">Tap to show or hide</T></Row>
            <TagRow>
              {list.map((t) => t.status === 'suggested' ? (
                <Row key={t.id} gap={space[1]}>
                  <Tag label={t.label} state="suggested" />
                  <Button variant="ghost" size="sm" title="Add" onPress={() => confirmTag(t, 'confirmed')} />
                  <Button variant="ghost" size="sm" title="No" onPress={() => confirmTag(t, 'rejected')} />
                </Row>
              ) : (
                <Tag key={t.id} label={t.label} state={t.discoverable ? 'selected' : 'stated'} hint={t.discoverable ? 'shown' : 'hidden'} onPress={() => toggle(t)} accessibilityLabel={`${t.label}, ${t.discoverable ? 'shown on your card' : 'hidden'}`} />
              ))}
            </TagRow>
          </View>
        );
      })}

      <T variant="title" style={{ marginTop: space[3] }}>More</T>
      <Card padded={false}>
        {[
          { title: 'Plugins and imports', caption: 'LinkedIn export, CSV, phone contacts, community connectors', href: '/plugins' },
          { title: 'Settings and data', caption: 'Export, delete, blocked people, nearby personas', href: '/settings' },
          { title: 'Build my team', caption: 'Turn a project into roles and people', href: '/team' },
        ].map((item, i) => (
          <Button key={item.href} variant="ghost" title={item.title} onPress={() => router.push(item.href as '/plugins')} style={{ justifyContent: 'flex-start', paddingHorizontal: space[4], minHeight: 56, borderTopWidth: i ? 1 : 0, borderTopColor: 'transparent' }} accessibilityHint={item.caption} />
        ))}
      </Card>

      {profile.is_demo ? (
        <Card>
          <Flag label="Demo account" />
          {msg ? <Notice tone="plain">{msg}</Notice> : null}
          <Row wrap>
            <Button size="sm" title="Reload demo network" loading={busy === 'load'} onPress={async () => { setBusy('load'); try { await clearDemoData(); const r = await loadDemoNetwork(); setMsg(`Loaded ${r.contacts} cards and ${r.notes} notes.`); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(null); } }} />
            <Button size="sm" title="Clear demo data" loading={busy === 'clear'} onPress={async () => { setBusy('clear'); try { await clearDemoData(); setMsg('Demo cards removed.'); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(null); } }} />
          </Row>
        </Card>
      ) : null}
      <Button title="Sign out" onPress={signOut} />
    </Screen>
  );
}
