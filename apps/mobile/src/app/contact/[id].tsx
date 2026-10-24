import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';

import { BText, Button, EmptyRow, Evidence, Field, Group, PersonCard, Row, RouteLine, Screen, ScreenHeader, Section, Tag, TagList, useTheme } from '@/bridge-design-system';
import { Back, Loading, Notice, Stack, shortDate, surnameInitial } from '@/components/shared';
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
  if (d.loading && !d.data) return <Screen><ScreenHeader left={<Back />} title="Card" /><Loading /></Screen>;
  if (d.error || !d.data) return <Screen><ScreenHeader left={<Back />} title="Card" /><Notice tone="dangerInk">{d.error ?? 'This card could not be found.'}</Notice></Screen>;
  const { c, claims, ev, notes, edges, rem, drafts } = d.data;
  const route = contactRoute(c.relationship, c.relationship_status);
  const setClaim = async (cid: string, status: 'confirmed' | 'rejected') => { const { error: e } = await supabase.from('contact_claims').update({ status }).eq('id', cid); if (e) setError(errorMessage(e)); else reload(); };
  const setEdge = async (eid: string, status: 'confirmed' | 'rejected') => { const { error: e } = await supabase.from('contact_edges').update({ status }).eq('id', eid); if (e) setError(errorMessage(e)); else reload(); };
  const byKind = (k: string[]) => claims.filter((x) => k.includes(x.kind));
  const evidenceFor = (evidenceId: string | null) => ev.find((e) => e.id === evidenceId);

  const suggested = byKind(['skill', 'tool', 'interest', 'goal', 'offer']).filter((x) => x.status === 'suggested');
  const more = byKind(['interest', 'goal', 'offer', 'org', 'role', 'project']);
  return (
    <Screen>
      <ScreenHeader left={<Back />} right={<Button variant="ghost" size="sm" label="Edit" onPress={() => router.push({ pathname: '/contact/edit', params: { id } })} />} title="Card" subtitle="Private to you. Source labels show where each fact came from." />
      <Section label="Who they are">
        <PersonCard name={c.name} role={[c.headline, c.company || c.school, c.location].filter(Boolean).join(', ') || 'No headline yet'} tab={surnameInitial(c.name)} tabTone="highlight" route={route}>
          <BText variant="secondary" color="inkSoft">{[RELATIONSHIP_LABEL[c.relationship] ?? c.relationship, c.how_met, c.met_at ? `met ${shortDate(c.met_at)}` : null].filter(Boolean).join(' · ')}{c.relationship_status === 'suggested' ? ' · relationship not confirmed' : ''}</BText>
          {c.relationship_status === 'suggested' ? <Button size="sm" label="Confirm I know them" onPress={async () => { await supabase.from('contacts').update({ relationship_status: 'confirmed' }).eq('id', id); reload(); }} /> : null}
          {byKind(['skill', 'tool']).length ? <TagList>{byKind(['skill', 'tool']).map((x) => <Tag key={x.id} label={x.label} variant={x.status === 'confirmed' ? 'stated' : 'suggested'} />)}</TagList> : null}
          <Button variant="primary" size="sm" label="Draft an ask" onPress={() => router.push({ pathname: '/draft', params: { contactId: id } })} />
          <Button size="sm" label="Add a note" onPress={() => router.push({ pathname: '/note/new', params: { contactId: id } })} />
          {c.email ? <Button size="sm" variant="ghost" label="Email" onPress={() => Linking.openURL(`mailto:${c.email}`)} /> : null}
        </PersonCard>
      </Section>
      {error ? <Notice tone="dangerInk">{error}</Notice> : null}

      {suggested.length ? (
        <Section label="Suggested, not confirmed">
          <Group dashed>
            {suggested.map((x) => (
              <Row key={x.id} title={x.label} titleVariant="label" subtitle={`${x.kind} · ${sourceLabel(evidenceFor(x.evidence_id)?.source ?? 'extracted')}`} trailing={<View style={{ flexDirection: 'row', gap: space[1] }}><Button variant="ghost" size="sm" label="Confirm" onPress={() => setClaim(x.id, 'confirmed')} /><Button variant="ghost" size="sm" label="No" onPress={() => setClaim(x.id, 'rejected')} /></View>} />
            ))}
          </Group>
        </Section>
      ) : null}

      <Section label="Evidence">
        {ev.length === 0 ? <EmptyRow title="No receipts yet. Add a note about how you met or what they are good at." actionLabel="Add a note" onPress={() => router.push({ pathname: '/note/new', params: { contactId: id } })} /> : (
          <Stack>{ev.map((e) => <Evidence key={e.id} quote={e.excerpt} marks={claims.filter((x) => x.evidence_id === e.id).map((x) => x.label).slice(0, 3)} source={`${sourceLabel(e.source)}, ${shortDate(e.observed_at)} · private to you`} stale={e.source === 'ai_suggested'} />)}</Stack>
        )}
      </Section>

      {more.length ? (
        <Section label="Interests, goals, and more">
          <TagList>{more.map((x) => <Tag key={x.id} label={`${x.kind === 'goal' ? 'Wants: ' : x.kind === 'offer' ? 'Offers: ' : ''}${x.label}`} variant={x.status === 'confirmed' ? 'stated' : 'suggested'} />)}</TagList>
        </Section>
      ) : null}

      <Section label="How you know them">
        {edges.length === 0 ? <EmptyRow title="No recorded links to other cards. Shared school or company alone is not a relationship." /> : (
          <Group>
            {edges.map((e) => {
              const other = e.from_contact_id === id ? e.to : e.from;
              const otherId = e.from_contact_id === id ? e.to_contact_id : e.from_contact_id;
              const kind = e.status === 'confirmed' && e.kind !== 'follows' && e.kind !== 'followed_by' ? 'intro' : 'suggested';
              return (
                <Row key={e.id} title={<RouteLine kind={kind} label={`${e.kind.replace(/_/g, ' ')} ${other?.name ?? 'you'}${e.status === 'suggested' ? ', unconfirmed' : ''}`} />} subtitle={e.note ?? undefined}
                  onPress={otherId && e.status !== 'suggested' ? () => router.push({ pathname: '/contact/[id]', params: { id: otherId } }) : undefined} chevron={!!otherId && e.status !== 'suggested'}
                  trailing={e.status === 'suggested' ? <View style={{ flexDirection: 'row', gap: space[1] }}><Button variant="ghost" size="sm" label="Confirm" onPress={() => setEdge(e.id, 'confirmed')} /><Button variant="ghost" size="sm" label="Remove" onPress={() => setEdge(e.id, 'rejected')} /></View> : undefined} />
              );
            })}
          </Group>
        )}
      </Section>

      <Section label="Notes">
        {notes.length === 0 ? <EmptyRow title="No notes yet." actionLabel="Capture a note" onPress={() => router.push({ pathname: '/note/new', params: { contactId: id } })} /> : (
          <Group>{notes.map((n) => <Row key={n.id} title={n.body} titleVariant="note" subtitle={`${shortDate(n.created_at)} · ${n.captured_via} · extraction ${n.extraction_status}`} />)}</Group>
        )}
      </Section>

      <Section label="Follow-ups">
        <Stack>
          {rem.filter((r) => !r.done_at).length ? <Group>{rem.filter((r) => !r.done_at).map((r) => <Row key={r.id} title={r.title} titleVariant="label" subtitle={`Due ${shortDate(r.due_at)}`} trailing={<Button variant="ghost" size="sm" label="Done" onPress={async () => { await supabase.from('reminders').update({ done_at: new Date().toISOString() }).eq('id', r.id); reload(); }} />} />)}</Group> : null}
          <Field label="Follow-up" placeholder="Remind me to…" value={reminder} onChangeText={setReminder} accessibilityLabel="New reminder" />
          <Button size="sm" fullWidth label="Remind me in a week" disabled={!reminder.trim()} onPress={async () => { try { const { error: e } = await supabase.from('reminders').insert({ owner_id: session?.user.id, contact_id: id, title: reminder.trim(), due_at: new Date(Date.now() + 7 * 86_400_000).toISOString() }); if (e) throw e; setReminder(''); reload(); } catch (e) { setError(errorMessage(e)); } }} />
        </Stack>
      </Section>

      {drafts.length ? <Section label="Drafts"><Group>{drafts.map((dr) => <Row key={dr.id} title={dr.subject} titleVariant="label" subtitle={`${dr.status} · ${shortDate(dr.created_at)}`} />)}</Group></Section> : null}

      <Section label="Archive">
        <Stack>
          <BText variant="secondary" color="inkSoft">The card leaves your file and search results. Notes stay. You can restore it from Settings.</BText>
          {confirmArchive ? <Button variant="danger" size="sm" fullWidth label={`Yes, archive ${c.name}`} onPress={async () => { await supabase.from('contacts').update({ archived: true }).eq('id', id); setConfirmArchive(false); router.back(); }} /> : null}
          <Button variant={confirmArchive ? 'ghost' : 'secondary'} size="sm" fullWidth label={confirmArchive ? 'Keep the card' : 'Archive this card'} onPress={() => setConfirmArchive(!confirmArchive)} />
        </Stack>
      </Section>
    </Screen>
  );
}
