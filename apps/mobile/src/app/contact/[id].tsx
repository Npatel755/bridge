import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, CardSection, EntryCard, EvidenceQuote, Field, Loading, Notice, RouteLine, Row, Screen, Sheet, T, Tag, TagRow, TopBar } from '@/components';
import { useTheme } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { errorMessage } from '@/lib/api';
import { sourceLabel } from '@/lib/contacts-data';
import { contactRoute, RELATIONSHIP_LABEL } from '@/lib/relationship';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function ContactDetail() {
  const { space } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [reminder, setReminder] = useState('');
  const [error, setError] = useState<string | null>(null);
  const d = useAsync(async () => {
    const [c, claims, ev, notes, edges, rem, drafts] = await Promise.all([
      supabase.from('contacts').select('*').eq('id', id).single(),
      supabase.from('contact_claims').select('id, kind, tag, label, status, evidence_id').eq('contact_id', id).neq('status', 'rejected'),
      supabase.from('evidence').select('id, source, excerpt, observed_at, url, confidence, note_id').eq('contact_id', id).order('observed_at', { ascending: false }),
      supabase.from('notes').select('id, body, created_at, captured_via, extraction_status').eq('contact_id', id).order('created_at', { ascending: false }),
      supabase.from('contact_edges').select('id, from_contact_id, to_contact_id, kind, status, note, from:contacts!contact_edges_from_contact_id_fkey(name), to:contacts!contact_edges_to_contact_id_fkey(name)').or(`from_contact_id.eq.${id},to_contact_id.eq.${id}`).neq('status', 'rejected'),
      supabase.from('reminders').select('id, title, due_at, done_at').eq('contact_id', id).order('due_at'),
      supabase.from('outreach_drafts').select('id, subject, body, status, created_at').eq('contact_id', id).order('created_at', { ascending: false }).limit(3),
    ]);
    if (c.error) throw c.error;
    return { c: c.data, claims: claims.data ?? [], ev: ev.data ?? [], notes: notes.data ?? [], edges: (edges.data ?? []) as unknown as { id: string; from_contact_id: string | null; to_contact_id: string; kind: string; status: string; note: string | null; from: { name: string } | null; to: { name: string } | null }[], rem: rem.data ?? [], drafts: drafts.data ?? [] };
  }, [id]);
  const reload = d.reload;
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  if (d.loading && !d.data) return <><TopBar onBack={() => router.back()} /><Screen><Loading /></Screen></>;
  if (d.error || !d.data) return <><TopBar onBack={() => router.back()} /><Screen><Notice>{d.error ?? 'This card could not be found.'}</Notice></Screen></>;
  const { c, claims, ev, notes, edges, rem, drafts } = d.data;
  const route = contactRoute(c.relationship, c.relationship_status);
  const setClaim = async (cid: string, status: 'confirmed' | 'rejected') => { const { error: e } = await supabase.from('contact_claims').update({ status }).eq('id', cid); if (e) setError(errorMessage(e)); else reload(); };
  const setEdge = async (eid: string, status: 'confirmed' | 'rejected') => { const { error: e } = await supabase.from('contact_edges').update({ status }).eq('id', eid); if (e) setError(errorMessage(e)); else reload(); };
  const byKind = (k: string[]) => claims.filter((x) => k.includes(x.kind));
  const evidenceFor = (evidenceId: string | null) => ev.find((e) => e.id === evidenceId);

  return (
    <>
      <TopBar onBack={() => router.back()} title="Card" right={<Button variant="ghost" size="sm" title="Edit" onPress={() => router.push({ pathname: '/contact/edit', params: { id } })} />} />
      <Screen>
        <EntryCard name={c.name} role={[c.headline, c.company || c.school, c.location].filter(Boolean).join(', ')} route={route} stacked>
          <CardSection>
            <T variant="body" color="inkSoft">{[RELATIONSHIP_LABEL[c.relationship] ?? c.relationship, c.how_met, c.met_at ? `met ${new Date(c.met_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : null].filter(Boolean).join(' · ')}{c.relationship_status === 'suggested' ? ' · relationship not confirmed' : ''}</T>
            {c.relationship_status === 'suggested' ? <Row><Button size="sm" title="Confirm I know them" onPress={async () => { await supabase.from('contacts').update({ relationship_status: 'confirmed' }).eq('id', id); reload(); }} /></Row> : null}
            <TagRow>{byKind(['skill', 'tool']).map((x) => <Tag key={x.id} label={x.label} state={x.status === 'confirmed' ? 'stated' : 'suggested'} />)}</TagRow>
            <Row wrap>
              <Button variant="primary" size="sm" title="Draft an ask" onPress={() => router.push({ pathname: '/draft', params: { contactId: id } })} />
              <Button size="sm" title="Add a note" onPress={() => router.push({ pathname: '/note/new', params: { contactId: id } })} />
              {c.email ? <Button size="sm" title="Email" onPress={() => import('react-native').then(({ Linking }) => Linking.openURL(`mailto:${c.email}`))} /> : null}
            </Row>
          </CardSection>
        </EntryCard>
        <T variant="caption" color="inkSoft">Private to you. Source labels show where each fact came from.</T>
        {error ? <Notice>{error}</Notice> : null}

        {byKind(['skill', 'tool', 'interest', 'goal', 'offer']).some((x) => x.status === 'suggested') ? (
          <Card>
            <T variant="name">Suggested, not confirmed</T>
            {byKind(['skill', 'tool', 'interest', 'goal', 'offer']).filter((x) => x.status === 'suggested').map((x) => (
              <Row key={x.id} between>
                <View style={{ flex: 1 }}><Tag label={x.label} state="suggested" /><T variant="caption" color="inkSoft">{x.kind} · {sourceLabel(evidenceFor(x.evidence_id)?.source ?? 'extracted')}</T></View>
                <Row><Button variant="ghost" size="sm" title="Confirm" onPress={() => setClaim(x.id, 'confirmed')} /><Button variant="ghost" size="sm" title="Not right" onPress={() => setClaim(x.id, 'rejected')} /></Row>
              </Row>
            ))}
          </Card>
        ) : null}

        <T variant="title" style={{ marginTop: space[2] }}>Evidence</T>
        {ev.length === 0 ? <Card dashed><T variant="body">No receipts yet. Add a note about how you met or what they are good at.</T></Card> : ev.map((e) => (
          <Card key={e.id}>
            <EvidenceQuote quote={e.excerpt} source={sourceLabel(e.source)} date={e.observed_at} unconfirmed={e.source === 'ai_suggested'} marks={claims.filter((x) => x.evidence_id === e.id).map((x) => x.label).slice(0, 3)} />
          </Card>
        ))}

        {byKind(['interest', 'goal', 'offer', 'org', 'role', 'project']).length ? (
          <>
            <T variant="title" style={{ marginTop: space[2] }}>Interests, goals, and more</T>
            <TagRow>{byKind(['interest', 'goal', 'offer', 'org', 'role', 'project']).map((x) => <Tag key={x.id} label={`${x.kind === 'goal' ? 'Wants: ' : x.kind === 'offer' ? 'Offers: ' : ''}${x.label}`} state={x.status === 'confirmed' ? 'stated' : 'suggested'} />)}</TagRow>
          </>
        ) : null}

        <T variant="title" style={{ marginTop: space[2] }}>Who they know</T>
        {edges.length === 0 ? <T variant="caption" color="inkSoft">No recorded links to other cards. Shared school or company alone is not a relationship.</T> : edges.map((e) => {
          const other = e.from_contact_id === id ? e.to : e.from;
          const otherId = e.from_contact_id === id ? e.to_contact_id : e.from_contact_id;
          return (
            <Card key={e.id}>
              <Row between>
                <View style={{ flex: 1 }}>
                  <RouteLine kind={e.status === 'confirmed' && e.kind !== 'follows' && e.kind !== 'followed_by' ? 'intro' : 'suggested'} label={`${e.kind.replace(/_/g, ' ')} ${other?.name ?? 'you'}${e.status === 'suggested' ? ', unconfirmed' : ''}`} />
                  {e.note ? <T variant="caption" color="inkSoft">{e.note}</T> : null}
                </View>
                {e.status === 'suggested' ? <Row><Button variant="ghost" size="sm" title="Confirm" onPress={() => setEdge(e.id, 'confirmed')} /><Button variant="ghost" size="sm" title="Remove" onPress={() => setEdge(e.id, 'rejected')} /></Row> : otherId ? <Button variant="ghost" size="sm" title="Open" onPress={() => router.push({ pathname: '/contact/[id]', params: { id: otherId } })} /> : null}
              </Row>
            </Card>
          );
        })}

        <T variant="title" style={{ marginTop: space[2] }}>Notes</T>
        {notes.length === 0 ? <Card dashed><T variant="body">No notes yet.</T><Button size="sm" title="Capture a note" onPress={() => router.push({ pathname: '/note/new', params: { contactId: id } })} style={{ alignSelf: 'flex-start' }} /></Card> : notes.map((n) => (
          <Card key={n.id}><T variant="note">{n.body}</T><T variant="caption" color="inkSoft">{new Date(n.created_at).toLocaleDateString()} · {n.captured_via} · extraction {n.extraction_status}</T></Card>
        ))}

        <T variant="title" style={{ marginTop: space[2] }}>Follow-ups</T>
        {rem.filter((r) => !r.done_at).map((r) => <Row key={r.id} between><T variant="body">{r.title} · {new Date(r.due_at).toLocaleDateString()}</T><Button variant="ghost" size="sm" title="Done" onPress={async () => { await supabase.from('reminders').update({ done_at: new Date().toISOString() }).eq('id', r.id); reload(); }} /></Row>)}
        <Row>
          <View style={{ flex: 1 }}><Field placeholder="Remind me to…" value={reminder} onChangeText={setReminder} /></View>
          <Button size="sm" title="In a week" disabled={!reminder.trim()} onPress={async () => { try { const { error } = await supabase.from('reminders').insert({ owner_id: session?.user.id, contact_id: id, title: reminder.trim(), due_at: new Date(Date.now() + 7 * 86_400_000).toISOString() }); if (error) throw error; setReminder(''); reload(); } catch (e) { setError(errorMessage(e)); } }} />
        </Row>

        {drafts.length ? <><T variant="title" style={{ marginTop: space[2] }}>Drafts</T>{drafts.map((dr) => <Card key={dr.id}><T variant="label">{dr.subject}</T><T variant="caption" color="inkSoft">{dr.status} · {new Date(dr.created_at).toLocaleDateString()}</T></Card>)}</> : null}

        <Button variant="danger" title="Archive this card" onPress={() => setConfirmArchive(true)} style={{ marginTop: space[4] }} />
        <Sheet visible={confirmArchive} onClose={() => setConfirmArchive(false)} title={`Archive ${c.name}?`}>
          <T variant="body" color="inkSoft">The card leaves your stack and search results. Notes stay. You can restore it from Settings.</T>
          <Button variant="danger" title="Archive" onPress={async () => { await supabase.from('contacts').update({ archived: true }).eq('id', id); setConfirmArchive(false); router.back(); }} />
        </Sheet>
      </Screen>
    </>
  );
}
