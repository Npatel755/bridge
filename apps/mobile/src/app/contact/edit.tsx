import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, Card, Field, Notice, Screen, ScreenTitle, T, Tag, TagRow, TopBar } from '@/components';
import { errorMessage } from '@/lib/api';
import { addClaims, addEvidence, createContact, splitList } from '@/lib/contacts-data';
import { RELATIONSHIP_LABEL } from '@/lib/relationship';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const RELS = ['friend', 'colleague', 'former_colleague', 'classmate', 'mentor', 'acquaintance', 'collaborator', 'met_once'];

export default function EditContact() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useSession();
  const [f, setF] = useState({ name: '', headline: '', company: '', school: '', location: '', email: '', how_met: '', met_at: '', relationship: 'acquaintance', skills: '', interests: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    supabase.from('contacts').select('*').eq('id', id).single().then(({ data }) => { if (data) setF((x) => ({ ...x, ...data, email: data.email ?? '', met_at: data.met_at ?? '' })); });
  }, [id]);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!session) return;
    setBusy(true); setError(null);
    try {
      const base = { name: f.name.trim(), headline: f.headline.trim(), company: f.company.trim(), school: f.school.trim(), location: f.location.trim(), email: f.email.trim() || null, how_met: f.how_met.trim(), met_at: f.met_at.trim() || null, relationship: f.relationship };
      let contactId = id;
      if (id) { const { error } = await supabase.from('contacts').update(base).eq('id', id); if (error) throw error; }
      else contactId = await createContact(session.user.id, { ...base, relationship_source: 'manual', relationship_status: 'confirmed' });
      const skills = splitList(f.skills), interests = splitList(f.interests);
      if (contactId && (skills.length || interests.length)) {
        const evId = await addEvidence(session.user.id, contactId, 'manual', `You added: ${[...skills, ...interests].join(', ')}`);
        await addClaims(session.user.id, contactId, evId, [...skills.map((s) => ({ kind: 'skill', label: s })), ...interests.map((s) => ({ kind: 'interest', label: s }))]);
      }
      if (id) router.back(); else router.replace({ pathname: '/contact/[id]', params: { id: contactId! } });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <TopBar left={<Button variant="ghost" size="sm" title="Cancel" onPress={() => router.back()} />} title={id ? 'Edit card' : 'New card'} />
      <Screen cta={<Button variant="primary" size="lg" title={id ? 'Save card' : 'Add to cards'} loading={busy} disabled={!f.name.trim()} onPress={save} />}>
        <ScreenTitle title={id ? 'Edit card' : 'Add someone you know'} caption="Only you can see this card. What you write here is used as evidence, with “you added” as the source." />
        <Card>
          <Field label="Name" value={f.name} onChangeText={set('name')} autoFocus={!id} />
          <Field label="Role or headline" value={f.headline} onChangeText={set('headline')} placeholder="Embedded engineer" />
          <Field label="Company" value={f.company} onChangeText={set('company')} />
          <Field label="School" value={f.school} onChangeText={set('school')} />
          <Field label="City" value={f.location} onChangeText={set('location')} />
          <Field label="Email" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
        </Card>
        <Card>
          <T variant="label" color="inkSoft">How you know them</T>
          <TagRow>{RELS.map((r) => <Tag key={r} label={RELATIONSHIP_LABEL[r] ?? r} state={f.relationship === r ? 'selected' : 'stated'} onPress={() => setF((x) => ({ ...x, relationship: r }))} />)}</TagRow>
          <Field label="How you met" value={f.how_met} onChangeText={set('how_met')} placeholder="Hackathon, class, through Jordan…" />
          <Field label="When (YYYY-MM-DD)" value={f.met_at} onChangeText={set('met_at')} placeholder="2026-10-12" autoCapitalize="none" />
        </Card>
        {!id ? (
          <Card>
            <Field label="Skills (comma separated)" value={f.skills} onChangeText={set('skills')} placeholder="Embedded systems, PCB design" />
            <Field label="Interests (comma separated)" value={f.interests} onChangeText={set('interests')} placeholder="Cycling, startups" />
          </Card>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
      </Screen>
    </>
  );
}
