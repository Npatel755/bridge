import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AskField, Button, Card, Flag, Loading, Notice, ResultCard, Row, Screen, ScreenTitle, T, TopBar } from '@/components';
import { useTheme } from '@/constants/theme';
import { api, errorMessage, type AskResponse } from '@/lib/api';

export default function Ask() {
  const { colors, space } = useTheme();
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
    setBusy(true); setError(null); setEditing(false); setSelected(0);
    try { const r = await api.ask(query.trim()); setResult(r); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
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
  useEffect(() => { import('@/lib/supabase').then(({ supabase }) => supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('archived', false).then((r) => setCards(r.count ?? 0))); }, []);

  const recs = result?.recommendations ?? [];
  const scopeLine = cards === null ? '' : ` from your ${cards} cards`;
  return (
    <>
      <TopBar onBack={() => router.back()} right={!editing && result ? <Button variant="ghost" size="sm" title="Edit question" onPress={() => setEditing(true)} /> : null} />
      <Screen>
        {editing ? (
          <>
            <ScreenTitle title="Ask your cards" caption="Plain words work best. Bridge searches only the people and notes you have saved." />
            <AskField value={q} onChange={setQ} onSubmit={() => run(q)} scope={cards ? `Searches only your ${cards} cards. Keyword search.` : 'Searches only your cards.'} />
            <Button variant="primary" size="lg" title="Find people" disabled={!q.trim()} loading={busy} onPress={() => run(q)} />
          </>
        ) : (
          <ScreenTitle title={q} caption={busy ? 'Searching your cards…' : result ? result.status === 'ok' ? `${recs.length} ${recs.length === 1 ? 'person' : 'people'}${scopeLine}. Ranked by expertise, then how well you know them.` : `No supported match${scopeLine}.` : ''} />
        )}
        {busy ? <Loading label="Reading your notes and cards…" /> : null}
        {error ? <Notice>{error}</Notice> : null}
        {result && !editing ? (
          <>
            <Row wrap>
              <Flag label={result.mode === 'llm' ? 'Explanations written with AI, facts from your cards' : 'Keyword search, no AI'} />
              {result.goal.tags.length ? <Flag label={`Looking for: ${result.goal.tags.join(', ')}`} /> : null}
            </Row>
            {result.status === 'no_supported_match' ? (
              <Card dashed>
                <T variant="body">{result.message}</T>
                {result.nextSteps.map((s, i) => <T key={i} variant="body" color="inkSoft">• {s}</T>)}
                <Row wrap>
                  <Button size="sm" title="Add a note" onPress={() => router.push('/note/new')} />
                  <Button size="sm" title="Import cards" onPress={() => router.push('/plugins')} />
                </Row>
              </Card>
            ) : (
              <View style={{ gap: space[2] }}>
                {recs.map((rec, i) => (
                  <View key={rec.contactId}>
                    <ResultCard rec={rec} ask={result.goal.query} expanded={i === selected} stacked={i === selected && recs.length > 1} tabOffset={i === selected ? 0 : Math.min(i, 4) * 44} onPress={i === selected ? undefined : () => setSelected(i)} />
                  </View>
                ))}
                {result.nextSteps.length ? (
                  <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/team', params: { description: result.goal.query } })} style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.cardEdge, borderRadius: 6, paddingHorizontal: space[4], paddingVertical: space[3], marginTop: space[2] }}>
                    <T variant="body">{result.nextSteps[0]}</T>
                    <T variant="caption" color="inkSoft">See the whole team in Build my team</T>
                  </Pressable>
                ) : null}
              </View>
            )}
            {result.reciprocal.length ? (
              <View style={{ gap: space[2], marginTop: space[4] }}>
                <T variant="title">You could help too</T>
                {result.reciprocal.map((o) => (
                  <Card key={o.contactId}>
                    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/contact/[id]', params: { id: o.contactId } })}>
                      {o.youCanHelp.slice(0, 1).map((h, i) => <T key={i} variant="note">{o.name.split(' ')[0]} wants {h.need.toLowerCase()}. You offer {h.yourMatch.join(', ')}.</T>)}
                      {o.youCanHelp.slice(0, 1).map((h, i) => <T key={i} variant="caption" color="inkSoft">{`${o.name.split(' ')[0]}'s goal, ${h.source}, ${h.date.slice(0, 10)}. Your offer, your profile.`}</T>)}
                    </Pressable>
                  </Card>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </Screen>
    </>
  );
}
