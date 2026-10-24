import { router, useFocusEffect } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AZRail, Button, Card, CardSection, EntryCard, LetterDivider, Loading, NetworkGraph, Notice, Row, Segmented, T, Tag, TagRow, type GraphEdge, type GraphNode } from '@/components';
import { useTheme } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { contactRoute } from '@/lib/relationship';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

interface C { id: string; name: string; headline: string; company: string; school: string; how_met: string; met_at: string | null; relationship: string; relationship_status: string }
interface Claim { contact_id: string; kind: string; tag: string; label: string; status: string }
interface Edge { from_contact_id: string | null; to_contact_id: string; kind: string; status: string }

const surname = (n: string) => (n.trim().split(/\s+/).pop()?.[0] ?? '#').toUpperCase();

export default function Network() {
  const { colors, space, sizes } = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const [view, setView] = useState<'stack' | 'graph'>('stack');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Record<string, number>>({});

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
    for (const cl of data.data?.claims ?? []) if (cl.status === 'confirmed' && ['skill', 'org', 'interest', 'goal'].includes(cl.kind)) { const e = count.get(cl.tag) ?? { label: cl.label, n: 0 }; e.n++; count.set(cl.tag, e); }
    return [...count.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([tag, e]) => ({ tag, label: e.label }));
  }, [data.data]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data.data?.contacts ?? []).filter((c) => {
      const tags = claimsBy.get(c.id) ?? [];
      if (filter && !tags.some((t) => t.tag === filter)) return false;
      if (!needle) return true;
      return [c.name, c.headline, c.company, c.school, ...tags.map((t) => t.label)].some((s) => s?.toLowerCase().includes(needle));
    }).sort((a, b) => surname(a.name).localeCompare(surname(b.name)) || a.name.localeCompare(b.name));
  }, [data.data, claimsBy, q, filter]);
  const groups = useMemo(() => {
    const g = new Map<string, C[]>();
    for (const c of visible) g.set(surname(c.name), [...(g.get(surname(c.name)) ?? []), c]);
    return [...g.entries()];
  }, [visible]);
  const total = data.data?.contacts.length ?? 0;

  const graph = useMemo(() => {
    const ids = new Set(visible.map((c) => c.id));
    const nodes: GraphNode[] = (data.data?.contacts ?? []).slice(0, 40).map((c) => ({ id: c.id, name: c.name, dim: !ids.has(c.id), route: contactRoute(c.relationship, c.relationship_status).kind }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges: GraphEdge[] = [
      ...nodes.map((n) => ({ from: null, to: n.id, kind: n.route })),
      ...(data.data?.edges ?? []).filter((e) => e.from_contact_id && nodeIds.has(e.from_contact_id) && nodeIds.has(e.to_contact_id)).map((e) => ({ from: e.from_contact_id, to: e.to_contact_id, kind: (e.status === 'confirmed' && (e.kind === 'knows' || e.kind === 'works_with' || e.kind === 'introduced') ? 'intro' : 'suggested') as GraphEdge['kind'] })),
    ];
    return { nodes, edges };
  }, [data.data, visible]);

  const jump = (letter: string) => { setCurrent(letter); const y = offsets.current[letter]; if (y !== undefined) scroller.current?.scrollTo({ y: Math.max(0, y - 8), animated: true }); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top + space[2] }}>
      <View style={{ paddingHorizontal: sizes.phoneGutter, gap: space[3] }}>
        <Row between>
          <T variant="display" accessibilityRole="header">Your cards</T>
          <Segmented options={[{ key: 'stack', label: 'Stack' }, { key: 'graph', label: 'Graph' }]} value={view} onChange={setView} />
        </Row>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge, borderRadius: 6, paddingHorizontal: space[3], minHeight: 44 }}>
          <Search size={18} strokeWidth={1.75} color={colors.inkSoft} />
          <TextInput accessibilityLabel="Search cards" value={q} onChangeText={setQ} placeholder={`Search ${total} cards by name, skill, or org`} placeholderTextColor={colors.inkFaint} style={{ flex: 1, fontFamily: 'InterTight_400Regular', fontSize: 15, color: colors.ink, paddingVertical: 10 }} />
        </View>
        {topFilters.length ? <TagRow>{topFilters.map((f) => <Tag key={f.tag} label={f.label} state={filter === f.tag ? 'selected' : 'stated'} onPress={() => setFilter(filter === f.tag ? null : f.tag)} />)}</TagRow> : null}
      </View>
      {data.loading && !data.data ? <Loading /> : data.error ? <View style={{ padding: sizes.phoneGutter }}><Notice>{data.error}</Notice></View> : null}
      {data.data && total === 0 ? (
        <View style={{ padding: sizes.phoneGutter }}>
          <Card dashed>
            <T variant="body">No cards yet. Add someone you met, capture a note, or import a LinkedIn export.</T>
            <Row wrap><Button size="sm" title="Add a card" onPress={() => router.push('/contact/edit')} /><Button size="sm" title="Import" onPress={() => router.push('/plugins')} /></Row>
          </Card>
        </View>
      ) : view === 'graph' ? (
        <ScrollView contentContainerStyle={{ padding: sizes.phoneGutter, gap: space[3] }}>
          <NetworkGraph nodes={graph.nodes} edges={graph.edges} meLabel="You" onSelect={(id) => router.push({ pathname: '/contact/[id]', params: { id } })} />
          <T variant="caption" color="inkSoft" center>Solid blue: direct. Solid with hollow node: a card knows another card. Dashed: unconfirmed, follower, or same school or company.</T>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ paddingLeft: sizes.phoneGutter, paddingRight: space[1], paddingBottom: space[8] }} scrollEventThrottle={64}
            onScroll={(e) => { const y = e.nativeEvent.contentOffset.y + 40; const hit = Object.entries(offsets.current).filter(([, o]) => o <= y).sort((a, b) => b[1] - a[1])[0]; if (hit && hit[0] !== current) setCurrent(hit[0]); }}>
            {visible.length === 0 ? <Card dashed style={{ marginTop: space[3] }}><T variant="body">No card matches “{q || filter}”. Try another word, or add a note about someone who does.</T></Card> : null}
            {groups.map(([letter, list]) => (
              <View key={letter} onLayout={(e) => { offsets.current[letter] = e.nativeEvent.layout.y; }}>
                <LetterDivider letter={letter} current={current === letter} />
                <View style={{ gap: space[1] }}>
                  {list.map((c, i) => {
                    const open = selected === c.id;
                    const tags = (claimsBy.get(c.id) ?? []).filter((t) => t.kind === 'skill' || t.kind === 'interest');
                    const route = contactRoute(c.relationship, c.relationship_status);
                    return (
                      <EntryCard key={c.id} name={c.name} role={[c.headline, c.company || c.school].filter(Boolean).join(', ')} route={route} collapsed={!open} tabOffset={open ? 0 : Math.min(i, 3) * 44} onPress={open ? undefined : () => setSelected(c.id)}>
                        <CardSection>
                          <T variant="body" color="inkSoft">{[c.how_met, c.met_at ? `met ${new Date(c.met_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : null].filter(Boolean).join('. ')}</T>
                          <TagRow>{tags.slice(0, 6).map((t) => <Tag key={t.tag + t.status} label={t.label} state={t.status === 'confirmed' ? 'stated' : 'suggested'} />)}</TagRow>
                          <Button size="sm" title="Open card" onPress={() => router.push({ pathname: '/contact/[id]', params: { id: c.id } })} style={{ alignSelf: 'flex-start' }} />
                        </CardSection>
                      </EntryCard>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
          <AZRail available={new Set(groups.map(([l]) => l))} current={current} onLetter={jump} />
        </View>
      )}
      {profile ? null : null}
    </View>
  );
}
