import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, EmptyRow, Group, PersonRow, Screen, ScreenHeader, SearchField, Section, Tag, TagList, useTheme } from '@/bridge-design-system';
import { AlphabetScrubber } from '@/components/AlphabetScrubber';
import { RelationshipGraph, type GraphEdge, type GraphNode } from '@/components/RelationshipGraph';
import { FocusPerson, Loading, Notice, Stack, shortDate, surnameInitial, type PersonView } from '@/components/shared';
import { useAsync } from '@/hooks/use-async';
import { contactRoute } from '@/lib/relationship';
import { supabase } from '@/lib/supabase';

interface C { id: string; name: string; headline: string; company: string; school: string; how_met: string; met_at: string | null; relationship: string; relationship_status: string }
interface Claim { contact_id: string; kind: string; tag: string; label: string; status: string }
interface Edge { from_contact_id: string | null; to_contact_id: string; kind: string; status: string }

export default function Network() {
  const { space, layout } = useTheme();
  const [mode, setMode] = useState<'cards' | 'graph'>('cards');
  const [q, setQ] = useState('');
  const [letter, setLetter] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const data = useAsync(async () => {
    const [c, cl, e] = await Promise.all([
      supabase.from('contacts').select('id, name, headline, company, school, how_met, met_at, relationship, relationship_status').eq('archived', false).order('name'),
      supabase.from('contact_claims').select('contact_id, kind, tag, label, status').neq('status', 'rejected'),
      supabase.from('contact_edges').select('from_contact_id, to_contact_id, kind, status').neq('status', 'rejected'),
    ]);
    if (c.error) throw c.error;
    return { contacts: (c.data ?? []) as C[], claims: (cl.data ?? []) as Claim[], edges: (e.data ?? []) as Edge[] };
  });
  const reload = data.reload;
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const claimsBy = useMemo(() => {
    const m = new Map<string, Claim[]>();
    for (const cl of data.data?.claims ?? []) m.set(cl.contact_id, [...(m.get(cl.contact_id) ?? []), cl]);
    return m;
  }, [data.data]);
  const topFilters = useMemo(() => {
    const count = new Map<string, { label: string; n: number }>();
    for (const cl of data.data?.claims ?? []) if (cl.status === 'confirmed' && ['skill', 'interest'].includes(cl.kind)) { const e = count.get(cl.tag) ?? { label: cl.label, n: 0 }; e.n++; count.set(cl.tag, e); }
    return [...count.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([tag, e]) => ({ tag, label: e.label }));
  }, [data.data]);
  const toView = useCallback((c: C): PersonView => {
    const tags = claimsBy.get(c.id) ?? [];
    return {
      id: c.id, name: c.name, role: [c.headline, c.company || c.school].filter(Boolean).join(', ') || 'No headline yet',
      route: contactRoute(c.relationship, c.relationship_status),
      quote: c.how_met || undefined, source: c.met_at ? `Your card, ${shortDate(c.met_at)}` : 'Your card',
      skills: tags.filter((t) => t.kind === 'skill' || t.kind === 'interest').map((t) => t.label),
      stale: c.relationship_status === 'suggested',
    };
  }, [claimsBy]);

  const sorted = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data.data?.contacts ?? []).filter((c) => {
      const tags = claimsBy.get(c.id) ?? [];
      if (filter && !tags.some((t) => t.tag === filter)) return false;
      if (letter && surnameInitial(c.name) !== letter) return false;
      if (!needle) return true;
      return [c.name, c.headline, c.company, c.school, ...tags.map((t) => t.label)].some((s) => s?.toLowerCase().includes(needle));
    }).sort((a, b) => surnameInitial(a.name).localeCompare(surnameInitial(b.name)) || a.name.localeCompare(b.name)).map(toView);
  }, [data.data, claimsBy, q, letter, filter, toView]);
  const total = data.data?.contacts.length ?? 0;
  const focus = sorted.find((p) => p.id === selected) ?? sorted[0];
  const others = sorted.filter((p) => p.id !== focus?.id);

  const graph = useMemo(() => {
    const nodes: GraphNode[] = sorted.slice(0, 12).map((p) => ({ id: p.id, name: p.name, route: p.route.kind }));
    const ids = new Set(nodes.map((n) => n.id));
    const edges: GraphEdge[] = [
      ...nodes.map((n) => ({ from: null, to: n.id, kind: n.route })),
      ...(data.data?.edges ?? []).filter((e) => e.from_contact_id && ids.has(e.from_contact_id) && ids.has(e.to_contact_id)).map((e) => ({ from: e.from_contact_id, to: e.to_contact_id, kind: (e.status === 'confirmed' ? 'intro' : 'suggested') as GraphEdge['kind'] })),
    ];
    return { nodes, edges };
  }, [sorted, data.data]);

  return (
    <Screen>
      <ScreenHeader title="Your card file" subtitle={total ? `${total} people, notes, and possible ways in.` : 'People, notes, and possible ways in.'}
        right={<Button size="sm" variant="ghost" label="Add note" onPress={() => router.push('/note/new')} />} />
      <Section label="Find a card">
        <SearchField value={q} onChangeText={(t) => { setQ(t); setLetter(''); }} placeholder="A name, skill, or company" accessibilityLabel="Find a card" />
        {topFilters.length ? <View style={{ marginTop: space[3] }}><TagList>{topFilters.map((f) => <Tag key={f.tag} label={f.label} variant={filter === f.tag ? 'selected' : 'stated'} onPress={() => setFilter(filter === f.tag ? null : f.tag)} />)}</TagList></View> : null}
      </Section>
      {data.loading && !data.data ? <Loading /> : null}
      {data.error ? <Notice tone="dangerInk">{data.error}</Notice> : null}
      {data.data && total === 0 ? (
        <Section label="Room for your first card">
          <Group dashed>
            <EmptyRow title="No cards yet. Add someone you met, capture a note, or import a list." actionLabel="Add a card" onPress={() => router.push('/contact/edit')} />
            <EmptyRow title="Bring in a LinkedIn export, CSV, or phone contacts." actionLabel="Import" onPress={() => router.push('/plugins')} />
          </Group>
        </Section>
      ) : null}
      {total > 0 ? (
        <Section label="Browse your people" action={
          <TagList>
            <Tag label="Cards" variant={mode === 'cards' ? 'selected' : 'stated'} onPress={() => setMode('cards')} />
            <Tag label="Graph" variant={mode === 'graph' ? 'selected' : 'stated'} onPress={() => setMode('graph')} />
          </TagList>
        }>
          {mode === 'graph' ? <RelationshipGraph nodes={graph.nodes} edges={graph.edges} selected={focus?.id ?? null} onSelect={setSelected} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
            <View style={{ flex: 1, minWidth: space[0], gap: layout.groupGap }}>
              {focus ? (
                <FocusPerson person={focus} compact mark={false} front={others.length > 0} action={<Button size="sm" variant="primary" label="Open card" onPress={() => router.push({ pathname: '/contact/[id]', params: { id: focus.id } })} />} />
              ) : (
                <Stack>
                  <EmptyRow title={letter ? `No cards under ${letter} yet.` : 'No cards match that search.'} />
                  <Button size="sm" variant="primary" fullWidth label="Show all cards" onPress={() => { setLetter(''); setQ(''); setFilter(null); }} />
                </Stack>
              )}
              {others.length ? (
                <Group>
                  {others.map((p, i) => (
                    <PersonRow key={p.id} name={p.name} reason={p.role} stale={p.stale} route={p.route} tab={surnameInitial(p.name)} tabOffset={[space[0], space[2], space[4]][i % 3]} onPress={() => setSelected(p.id)} />
                  ))}
                </Group>
              ) : null}
            </View>
            {mode === 'cards' ? <AlphabetScrubber value={letter} onChange={(l) => setLetter(l === letter ? '' : l)} /> : null}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
