import type { TeamPlan } from '@bridge/core';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AskField, Button, Card, Flag, Loading, NearbyDot, Notice, Row, Screen, T } from '@/components';
import { useTheme } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { errorMessage } from '@/lib/api';
import { loadDemoNetwork } from '@/lib/demo';
import { useNearbyOn } from '@/lib/nearby/state';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface Reminder { id: string; title: string; due_at: string; contact: { id: string; name: string } | null }
interface Goal { id: string; description: string; plan: TeamPlan | null }

const EXAMPLES = ['Who can help prototype a smart bike light?', 'Who could introduce me to someone in manufacturing?', 'Who might want to start something with me?'];

export default function Home() {
  const { colors, space, radius } = useTheme();
  const { profile } = useSession();
  const nearbyOn = useNearbyOn();
  const [q, setQ] = useState('');
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
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const submit = () => q.trim() && router.push({ pathname: '/ask', params: { q: q.trim() } });
  const n = home.data?.contacts ?? 0;
  const plan = home.data?.goal?.plan;
  const filled = plan?.roles.filter((r) => r.filled).length ?? 0;
  const dueLabel = (d: string) => { const diff = Math.round((new Date(d).getTime() - Date.now()) / 86_400_000); return diff <= 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `In ${diff} days`; };

  return (
    <Screen contentStyle={{ paddingTop: space[6] }}>
      <Row between>
        <T variant="caption" color="inkSoft">{today}</T>
        {nearbyOn ? <Pressable onPress={() => router.push('/nearby')} accessibilityRole="button" accessibilityLabel="Nearby is on" style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], backgroundColor: colors.card, borderColor: colors.cardEdge, borderWidth: 1, borderRadius: radius.round, paddingHorizontal: space[3], height: 32 }}><NearbyDot state="on" /><T variant="label">Nearby on</T></Pressable> : null}
      </Row>
      <T variant="display" accessibilityRole="header">What are you working on, {first}?</T>
      <AskField value={q} onChange={setQ} onSubmit={submit} scope={n ? `Searches only your ${n} card${n === 1 ? '' : 's'}. Keyword search.` : 'Searches only your cards. Add a card or load the demo first.'} />
      {q.trim() ? <Button variant="primary" title="Ask your cards" onPress={submit} /> : null}
      <View style={{ gap: space[2] }}>
        {EXAMPLES.map((e) => (
          <Pressable key={e} accessibilityRole="button" onPress={() => router.push({ pathname: '/ask', params: { q: e } })} style={({ pressed }) => [{ backgroundColor: colors.tab, borderRadius: radius.card, paddingHorizontal: space[4], paddingVertical: space[3] }, pressed && { opacity: 0.8 }]}>
            <T variant="note">{e}</T>
          </Pressable>
        ))}
      </View>

      {profile?.is_demo && home.data && n === 0 ? (
        <Card>
          <Flag label="Demo account" />
          <T variant="body">Load about 40 fictional cards, notes, plugin imports, and nearby personas to explore every feature.</T>
          {msg ? <Notice tone="confirm">{msg}</Notice> : null}
          <Button title="Load the demo network" loading={demoBusy} onPress={async () => { setDemoBusy(true); try { const r = await loadDemoNetwork(); setMsg(`Loaded ${r.contacts} cards and ${r.notes} notes.`); reload(); } catch (e) { setMsg(errorMessage(e)); } finally { setDemoBusy(false); } }} />
        </Card>
      ) : null}

      <Row between style={{ marginTop: space[3] }}>
        <T variant="title">Your goal</T>
        <Link href="/team" asChild><Button variant="ghost" size="sm" title="Build my team" /></Link>
      </Row>
      {home.loading && !home.data ? <Loading /> : home.data?.goal && plan ? (
        <Card>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/team', params: { id: home.data?.goal?.id } })} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
            <View style={{ flex: 1 }}>
              <T variant="name">{home.data.goal.description}</T>
              <T variant="caption" color="inkSoft">{filled} of {plan.roles.length} roles have someone. {plan.roles.length - filled} open.</T>
            </View>
            <View style={{ flexDirection: 'row', gap: 3 }} accessibilityElementsHidden>
              {plan.roles.map((r, i) => <View key={i} style={{ width: 10, height: 22, borderRadius: 2, backgroundColor: r.filled ? colors.action : 'transparent', borderWidth: r.filled ? 0 : 1, borderColor: colors.cardEdge, borderStyle: 'dashed' }} />)}
            </View>
          </Pressable>
        </Card>
      ) : (
        <Card dashed>
          <T variant="body">No goal yet. Describe what you want to build and Bridge will turn it into roles and find people for each.</T>
          <Button size="sm" title="Describe a project" onPress={() => router.push('/team')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      )}

      <T variant="title" style={{ marginTop: space[3] }}>Follow-ups</T>
      {home.error ? <Notice>{home.error}</Notice> : null}
      {home.data && home.data.reminders.length === 0 ? (
        <Card dashed><T variant="body">Nothing to follow up on. Add a reminder from any card after you meet someone.</T></Card>
      ) : (
        <Card padded={false}>
          {home.data?.reminders.map((r, i) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderTopWidth: i ? 1 : 0, borderTopColor: colors.rule }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${r.contact?.name ?? 'card'}`} onPress={() => r.contact && router.push({ pathname: '/contact/[id]', params: { id: r.contact.id } })} style={{ width: 28, height: 28, borderRadius: radius.chip, backgroundColor: colors.tab, alignItems: 'center', justifyContent: 'center' }}>
                <T variant="tabLetter" color="inkSoft">{(r.contact?.name ?? '?').trim().split(/\s+/).pop()?.[0]?.toUpperCase()}</T>
              </Pressable>
              <View style={{ flex: 1 }}>
                <T variant="body">{r.title}</T>
                <T variant="caption" style={{ color: new Date(r.due_at).getTime() <= Date.now() ? colors.cautionInk : colors.inkSoft }}>{dueLabel(r.due_at)}</T>
              </View>
              <Button variant="ghost" size="sm" title="Done" onPress={async () => { await supabase.from('reminders').update({ done_at: new Date().toISOString() }).eq('id', r.id); reload(); }} />
            </View>
          ))}
        </Card>
      )}
      <Row wrap style={{ marginTop: space[3] }}>
        <Button size="sm" title="Capture a note" onPress={() => router.push('/note/new')} />
        <Button size="sm" title="Add a card" onPress={() => router.push('/contact/edit')} />
        <Button size="sm" title="Import" onPress={() => router.push('/plugins')} />
      </Row>
    </Screen>
  );
}
