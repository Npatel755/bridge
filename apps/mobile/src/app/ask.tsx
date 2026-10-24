import type { Recommendation } from '@bridge/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { AskField, Button, EmptyRow, Evidence, Group, PersonCard, PersonRow, Row, Screen, ScreenHeader, Section, Tag, TagList, useTheme } from '@/bridge-design-system';
import { Back, Loading, Notice, Stack, surnameInitial } from '@/components/shared';
import { api, errorMessage, type AskResponse } from '@/lib/api';
import { routeInfo } from '@/lib/relationship';
import { supabase } from '@/lib/supabase';

const marksFor = (rec: Recommendation, terms: string[], excerpt: string) =>
  [...rec.matchedTags.map((t) => t.label), ...terms].filter((m) => m && excerpt.toLowerCase().includes(m.toLowerCase()));

export default function Ask() {
  const { space } = useTheme();
  const params = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(params.q ?? '');
  const [editing, setEditing] = useState(!params.q);
  const [busy, setBusy] = useState(!!params.q);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [selected, setSelected] = useState(0);
  const [cards, setCards] = useState<number | null>(null);

  async function run(query: string) {
    if (!query.trim()) return;
    setBusy(true); setError(null); setEditing(false); setSelected(0); setResult(null);
    try { setResult(await api.ask(query.trim())); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  useEffect(() => {
    const q0 = params.q?.trim();
    if (!q0) return;
    let cancelled = false;
    (async () => {
      try { const r = await api.ask(q0); if (!cancelled) { setResult(r); setSelected(0); } } catch (e) { if (!cancelled) setError(errorMessage(e)); } finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [params.q]);
  useEffect(() => { supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('archived', false).then((r) => setCards(r.count ?? 0)); }, []);

  const recs = result?.recommendations ?? [];
  const top = recs[selected] ?? recs[0];
  const others = recs.filter((r) => r !== top).slice(0, 4);
  const terms = result?.goal.terms ?? [];
  const cite = top?.citations.find((c) => c.excerpt) ?? top?.citations[0];
  const excerpt = cite?.excerpt ?? cite?.value ?? top?.why ?? '';

  return (
    <Screen>
      <ScreenHeader title={editing ? 'Ask your network' : q} subtitle={editing ? `Plain words work best. Bridge searches only your ${cards ?? ''} saved cards and notes.` : busy ? 'Searching your cards…' : result ? result.status === 'ok' ? `${recs.length} ${recs.length === 1 ? 'person' : 'people'} from your ${cards ?? ''} cards. ${result.mode === 'llm' ? 'Explanations written with AI; facts from your cards.' : 'Keyword search, no AI.'}` : `No supported match in your ${cards ?? ''} cards.` : undefined}
        left={<Back />} right={!editing && result ? <Button variant="ghost" size="sm" label="Edit" onPress={() => setEditing(true)} /> : undefined} />
      {editing ? (
        <Section label="Your question">
          <Stack>
            <Group><AskField value={q} onChangeText={setQ} onSubmit={() => run(q)} embedded /></Group>
            <Button variant="primary" size="sm" fullWidth label={busy ? 'Searching…' : 'Find people'} disabled={!q.trim() || busy} onPress={() => run(q)} />
          </Stack>
        </Section>
      ) : null}
      {busy ? <Loading label="Reading your notes and cards…" /> : null}
      {error ? <Notice tone="dangerInk">{error}</Notice> : null}
      {result && !editing && result.goal.tags.length ? (
        <Section label="Looking for"><TagList>{result.goal.tags.map((t) => <Tag key={t} label={t} variant="selected" />)}</TagList></Section>
      ) : null}
      {result && !editing && result.status !== 'ok' ? (
        <Section label="Room for another connection">
          <Stack>
            <EmptyRow title={result.message} />
            {result.nextSteps.map((s, i) => <Notice key={i}>{s}</Notice>)}
            <Button size="sm" variant="primary" fullWidth label="Add a note about someone" onPress={() => router.push('/note/new')} />
            <Button size="sm" fullWidth label="Import cards" onPress={() => router.push('/plugins')} />
          </Stack>
        </Section>
      ) : null}
      {result && !editing && top ? (
        <>
          <Section label="A good place to start">
            <PersonCard name={top.name} role={top.headline ?? top.howYouKnow} tab={surnameInitial(top.name)} tabTone="highlight" route={routeInfo(top.route, { howYouKnow: top.howYouKnow })} front={others.length > 0}>
              {excerpt ? <Evidence quote={excerpt} marks={marksFor(top, terms, excerpt)} source={`${cite?.sourceLabel ?? 'Your note'}${cite?.date ? `, ${cite.date.slice(0, 10)}` : ''} · private to you`} stale={cite?.status === 'suggested'} /> : null}
              {top.matchedTags.length ? <TagList>{top.matchedTags.slice(0, 3).map((t) => <Tag key={t.tag} label={t.label} variant={t.exact ? 'stated' : 'suggested'} />)}</TagList> : null}
              {top.uncertainties.map((u, i) => <Notice key={i} tone="cautionInk">{u}</Notice>)}
              <Row title={top.suggestedAsk} titleVariant="note" overline="Suggested ask" />
              <Button size="sm" variant="primary" label="Open card" onPress={() => router.push({ pathname: '/contact/[id]', params: { id: top.contactId } })} />
              <Button size="sm" label={top.route.type === 'introduction' ? 'Draft intro request' : 'Draft a message'} onPress={() => router.push({ pathname: '/draft', params: { contactId: top.contactId, ask: result.goal.query } })} />
            </PersonCard>
          </Section>
          {others.length ? (
            <Section label="Other ways in">
              <Group>
                {others.map((rec, i) => (
                  <PersonRow key={rec.contactId} name={rec.name} reason={`${rec.headline ?? rec.howYouKnow}. ${rec.why}`} route={routeInfo(rec.route, { howYouKnow: rec.howYouKnow })} tab={surnameInitial(rec.name)} tabOffset={[space[0], space[2], space[4]][i % 3]} onPress={() => setSelected(recs.indexOf(rec))} />
                ))}
              </Group>
            </Section>
          ) : null}
          <Section label="Your next step">
            <Group>
              <Row title={result.nextSteps[0] ?? 'Build a team for this idea'} titleVariant="label" subtitle="See which roles you can fill and what's still missing." chevron onPress={() => router.push({ pathname: '/team', params: { description: result.goal.query } })} />
            </Group>
          </Section>
          {result.reciprocal.length ? (
            <Section label="You could help too">
              <Group>
                {result.reciprocal.map((o) => {
                  const h = o.youCanHelp[0];
                  return <Row key={o.contactId} title={h ? `${o.name.split(' ')[0]} wants ${h.need.toLowerCase()}. You offer ${h.yourMatch.join(', ')}.` : o.name} titleVariant="note" subtitle={h ? `${o.name.split(' ')[0]}'s goal, ${h.source}, ${h.date.slice(0, 10)}.` : undefined} chevron onPress={() => router.push({ pathname: '/contact/[id]', params: { id: o.contactId } })} />;
                })}
              </Group>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
