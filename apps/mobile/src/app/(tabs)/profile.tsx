import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { BText, Button, Evidence, Group, PersonCard, Row, Screen, ScreenHeader, Section, Tag, TagList, useTheme } from '@/bridge-design-system';
import { Loading, Notice, Stack, surnameInitial } from '@/components/shared';
import { useAsync } from '@/hooks/use-async';
import { errorMessage } from '@/lib/api';
import { clearDemoData, loadDemoNetwork } from '@/lib/demo';
import { useNearbyOn } from '@/lib/nearby/state';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface PTag { id: string; kind: string; tag: string; label: string; status: string; discoverable: boolean; source: string }
const KIND_LABEL: Record<string, string> = { skill: 'Skills', tool: 'Tools', interest: 'Interests', goal: 'Goals', offer: 'What you can offer' };

export default function Profile() {
  const { space } = useTheme();
  const { profile, signOut, refreshProfile } = useSession();
  const nearbyOn = useNearbyOn();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const tags = useAsync(async () => {
    const { data, error } = await supabase.from('profile_tags').select('id, kind, tag, label, status, discoverable, source').neq('status', 'rejected').order('kind').order('label');
    if (error) throw error;
    return (data ?? []) as PTag[];
  });
  const counts = useAsync(async () => {
    const [n, d] = await Promise.all([
      supabase.from('notes').select('id', { count: 'exact', head: true }),
      supabase.from('outreach_drafts').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    ]);
    return { notes: n.count ?? 0, drafts: d.count ?? 0 };
  });
  const reload = tags.reload, reloadCounts = counts.reload;
  useFocusEffect(useCallback(() => { reload(); reloadCounts(); refreshProfile(); }, [reload, reloadCounts, refreshProfile]));
  const shown = (tags.data ?? []).filter((t) => t.discoverable && t.status === 'confirmed');
  const goal = (tags.data ?? []).find((t) => t.kind === 'goal' && t.status === 'confirmed');
  const role = [profile?.role_title, profile?.company || profile?.school].filter(Boolean).join(', ');
  const toggle = async (t: PTag) => { await supabase.from('profile_tags').update({ discoverable: !t.discoverable }).eq('id', t.id); reload(); };
  const confirmTag = async (t: PTag, status: 'confirmed' | 'rejected') => { await supabase.from('profile_tags').update({ status }).eq('id', t.id); reload(); };

  if (!profile) return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <ScreenHeader title="Your card" subtitle="Only what is on the card below is visible to people you match with. Your email, cards, and notes are never shown." right={<Button variant="ghost" size="sm" label="Edit" onPress={() => router.push('/onboarding?edit=1')} />} />
      <Section label="How your card looks to others">
        <PersonCard name={profile.display_name || 'You'} role={role || 'Add a role and company'} tab={surnameInitial(profile.display_name || 'You')} tabTone="card">
          {profile.bio || goal ? <Evidence quote={profile.bio || goal!.label} marks={[]} source={profile.bio ? 'Your bio' : 'Your goal'} /> : <BText variant="secondary" color="inkSoft">No bio yet.</BText>}
          {shown.length ? <TagList>{shown.slice(0, 8).map((t) => <Tag key={t.id} label={t.label} />)}</TagList> : <BText variant="secondary" color="inkSoft">No discoverable tags. Nearby needs at least one skill and one interest shown here.</BText>}
          {[profile.city, profile.industry, profile.career_stage].filter(Boolean).length ? <BText variant="secondary" color="inkSoft">{[profile.city, profile.industry, profile.career_stage].filter(Boolean).join(' · ')}</BText> : null}
        </PersonCard>
      </Section>

      {Object.entries(KIND_LABEL).map(([kind, title]) => {
        const list = (tags.data ?? []).filter((t) => t.kind === kind);
        if (!list.length) return null;
        return (
          <Section key={kind} label={title} action={<BText variant="caption" color="inkFaint">Tap to show or hide</BText>}>
            <Stack>
              <TagList>{list.filter((t) => t.status !== 'suggested').map((t) => <Tag key={t.id} label={t.label} variant={t.discoverable ? 'selected' : 'stated'} onPress={() => toggle(t)} />)}</TagList>
              {list.some((t) => t.status === 'suggested') ? (
                <Group dashed>
                  {list.filter((t) => t.status === 'suggested').map((t) => (
                    <Row key={t.id} title={t.label} titleVariant="label" subtitle={`Suggested from ${t.source.replace(/_/g, ' ')}`} trailing={<View style={{ flexDirection: 'row', gap: space[1] }}>
                      <Button variant="ghost" size="sm" label="Add" onPress={() => confirmTag(t, 'confirmed')} />
                      <Button variant="ghost" size="sm" label="No" onPress={() => confirmTag(t, 'rejected')} />
                    </View>} />
                  ))}
                </Group>
              ) : null}
            </Stack>
          </Section>
        );
      })}

      <Section label="Bridge">
        <Group>
          <Row title="Plugins and imports" titleVariant="label" subtitle="LinkedIn export, CSV, phone contacts, community connectors" chevron onPress={() => router.push('/plugins')} />
          <Row title="Nearby discovery" titleVariant="label" subtitle={nearbyOn ? 'On, sharing rough distance only' : 'Off'} chevron onPress={() => router.push('/nearby')} />
          <Row title="Build my team" titleVariant="label" subtitle="Turn a project into roles and people" chevron onPress={() => router.push('/team')} />
          <Row title="Settings and data" titleVariant="label" subtitle="Export, delete, blocked people, nearby personas" chevron onPress={() => router.push('/settings')} />
        </Group>
      </Section>
      <Section label="Private to you">
        <Group>
          <Row title="Notes" titleVariant="label" subtitle={`${counts.data?.notes ?? '–'} saved, visible only to you`} chevron onPress={() => router.push('/note/new')} />
          <Row title="Drafts" titleVariant="label" subtitle={`${counts.data?.drafts ?? '–'} waiting for your edits`} chevron onPress={() => router.push('/network')} />
        </Group>
      </Section>

      <>
        <Section label={profile.is_demo ? 'Demo account' : 'Sample data (fictional)'}>
          <Stack>
            {msg ? <Notice tone="confirmInk">{msg}</Notice> : null}
            <Group>
              <Row title={profile.is_demo ? 'Reload demo network' : 'Load sample network'} titleVariant="label" subtitle={busy === 'load' ? 'Loading…' : 'About 40 fictional cards, notes and personas. Your own cards are untouched.'} onPress={async () => { if (busy) return; setBusy('load'); try { await clearDemoData(); const r = await loadDemoNetwork(); setMsg(`Loaded ${r.contacts} cards and ${r.notes} notes.`); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(null); } }} />
              <Row title={profile.is_demo ? 'Clear demo data' : 'Remove sample data'} titleVariant="label" subtitle={busy === 'clear' ? 'Clearing…' : 'Removes only the fictional cards'} onPress={async () => { if (busy) return; setBusy('clear'); try { await clearDemoData(); setMsg('Demo cards removed.'); } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(null); } }} />
            </Group>
          </Stack>
        </Section>
      </>
      <Button size="sm" fullWidth label="Sign out" onPress={signOut} />
    </Screen>
  );
}
