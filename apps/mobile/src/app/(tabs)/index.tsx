import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { AskField, Button, EmptyRow, Group, Row, Screen, ScreenHeader, Section } from '@/bridge-design-system';
import { Loading, Notice, Stack, surnameInitial } from '@/components/shared';
import { useAsync } from '@/hooks/use-async';
import { errorMessage } from '@/lib/api';
import { loadDemoNetwork } from '@/lib/demo';
import { useNearbyOn } from '@/lib/nearby/state';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { TeamPlan } from '@bridge/core';

interface Reminder { id: string; title: string; due_at: string; contact: { id: string; name: string } | null }
interface Goal { id: string; description: string; plan: TeamPlan | null }

const EXAMPLES = ['Who can help prototype a smart bike light?', 'Who could introduce me to someone in manufacturing?', 'Who might want to start something with me?'];

export default function Home() {
  const { profile } = useSession();
  const nearbyOn = useNearbyOn();
  const [q, setQ] = useState('');
  const [now] = useState(() => Date.now());
  const [demoBusy, setDemoBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const home = useAsync(async () => {
    const [c, r, g] = await Promise.all([
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('archived', false),
      supabase.from('reminders').select('id, title, due_at, contact:contacts(id, name)').is('done_at', null).order('due_at').limit(5),
      supabase.from('project_requests').select('id, description, plan').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return { contacts: c.count ?? 0, reminders: (r.data ?? []) as unknown as Reminder[], goal: (g.data as Goal | null) ?? null };
  });
  const reload = home.reload;
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const first = profile?.display_name?.split(' ')[0] ?? 'there';
  const n = home.data?.contacts ?? 0;
  const plan = home.data?.goal?.plan;
  const filled = plan?.roles.filter((r) => r.filled).length ?? 0;
  const submit = (text = q) => text.trim() && router.push({ pathname: '/ask', params: { q: text.trim() } });
  const dueLabel = (d: string) => { const diff = Math.round((new Date(d).getTime() - now) / 86_400_000); return diff <= 0 ? 'Due today' : diff === 1 ? 'Due tomorrow' : `Due in ${diff} days`; };

  return (
    <Screen>
      <ScreenHeader title="Ask your network" subtitle={n ? `Hi ${first}. Searches only your ${n} card${n === 1 ? '' : 's'}; answers cite your own notes.` : `Hi ${first}. Bridge only answers from people you add.`}
        right={nearbyOn ? <Button size="sm" variant="ghost" label="Nearby on" onPress={() => router.push('/nearby')} /> : undefined} />
      <Section label="Your question">
        <Stack>
          <Group><AskField value={q} onChangeText={setQ} onSubmit={() => submit()} placeholder={EXAMPLES[0]} embedded /></Group>
          <Button size="sm" variant="primary" label="Find people" fullWidth disabled={!q.trim()} onPress={() => submit()} />
        </Stack>
      </Section>
      <Section label="Try asking">
        <Group>{EXAMPLES.map((e) => <Row key={e} title={e} titleVariant="note" chevron onPress={() => submit(e)} />)}</Group>
      </Section>

      {profile?.is_demo && home.data && n === 0 ? (
        <Section label="Demo account">
          <Stack>
            <EmptyRow title="Load about 40 fictional cards, notes, plugin imports and nearby personas to explore every feature." />
            {msg ? <Notice tone="confirmInk">{msg}</Notice> : null}
            <Button size="sm" variant="primary" fullWidth label={demoBusy ? 'Loading…' : 'Load the demo network'} disabled={demoBusy} onPress={async () => { setDemoBusy(true); try { const r = await loadDemoNetwork(); setMsg(`Loaded ${r.contacts} cards and ${r.notes} notes.`); reload(); } catch (e) { setMsg(errorMessage(e)); } finally { setDemoBusy(false); } }} />
          </Stack>
        </Section>
      ) : null}
      {!profile?.is_demo && home.data && n === 0 ? (
        <Section label="Room for your first card">
          <Group dashed>
            <Row title="Add a card" titleVariant="label" subtitle="Someone you already know." chevron onPress={() => router.push('/contact/edit')} />
            <Row title="Write a note" titleVariant="label" subtitle="What you remember about meeting someone." chevron onPress={() => router.push('/note/new')} />
            <Row title="Import" titleVariant="label" subtitle="LinkedIn export, CSV, or phone contacts." chevron onPress={() => router.push('/plugins')} />
          </Group>
        </Section>
      ) : null}

      <Section label="Your next step">
        {home.loading && !home.data ? <Loading /> : (
          <Group dashed={!plan}>
            {home.data?.goal && plan ? (
              <Row title={home.data.goal.description} titleVariant="rowName" subtitle={`${filled} of ${plan.roles.length} roles have someone. ${plan.roles.length - filled} open.`} chevron onPress={() => router.push({ pathname: '/team', params: { id: home.data?.goal?.id } })} />
            ) : (
              <Row title="Build a team for an idea" titleVariant="label" subtitle="See which roles your network can fill and what's still missing." chevron onPress={() => router.push('/team')} />
            )}
          </Group>
        )}
      </Section>

      <Section label="Follow-ups">
        {home.error ? <Notice tone="dangerInk">{home.error}</Notice> : null}
        {home.data && home.data.reminders.length === 0 ? (
          <EmptyRow title="Nothing to follow up on. Add a reminder from any card after you meet someone." />
        ) : (
          <Group>
            {home.data?.reminders.map((r) => (
              <Row key={r.id} overline={r.contact ? `${surnameInitial(r.contact.name)} · ${r.contact.name}` : undefined} title={r.title} subtitle={dueLabel(r.due_at)} subtitleColor={new Date(r.due_at).getTime() <= now ? 'cautionInk' : 'inkSoft'}
                onPress={() => r.contact && router.push({ pathname: '/contact/[id]', params: { id: r.contact.id } })}
                trailing={<Button variant="ghost" size="sm" label="Done" onPress={async () => { await supabase.from('reminders').update({ done_at: new Date().toISOString() }).eq('id', r.id); reload(); }} />} />
            ))}
          </Group>
        )}
      </Section>
      <Section label="Add to your card file">
        <Group>
          <Row title="Capture a note" titleVariant="label" chevron onPress={() => router.push('/note/new')} />
          <Row title="Add a card" titleVariant="label" chevron onPress={() => router.push('/contact/edit')} />
          <Row title="Import people" titleVariant="label" chevron onPress={() => router.push('/plugins')} />
        </Group>
      </Section>
    </Screen>
  );
}
