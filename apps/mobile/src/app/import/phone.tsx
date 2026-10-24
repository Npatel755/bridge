import * as Contacts from 'expo-contacts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { Button, EmptyRow, Field, Group, Row, Screen, ScreenHeader, Section, Toggle } from '@/bridge-design-system';
import { Back, Notice } from '@/components/shared';
import { errorMessage } from '@/lib/api';
import { addEvidence, createContact } from '@/lib/contacts-data';
import { useSession } from '@/lib/session';

interface PhoneRow { id: string; name: string; email: string | null; company: string | null; title: string | null }

export default function ImportPhone() {
  const { session } = useSession();
  const [perm, setPerm] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [rows, setRows] = useState<PhoneRow[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const unsupported = Platform.OS === 'web';

  async function load() {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') { setPerm('denied'); return; }
      setPerm('granted');
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Emails, Contacts.Fields.Company, Contacts.Fields.JobTitle], pageSize: 2000, sort: Contacts.SortTypes.LastName });
      setRows(data.filter((c) => c.name).map((c) => ({ id: c.id ?? c.name!, name: c.name!, email: c.emails?.[0]?.email ?? null, company: c.company ?? null, title: c.jobTitle ?? null })));
    } catch (e) { setError(errorMessage(e)); }
  }
  useEffect(() => { if (unsupported) return; const t = setTimeout(load, 0); return () => clearTimeout(t); }, [unsupported]);
  const visible = useMemo(() => rows.filter((r) => !q || [r.name, r.company, r.email].some((s) => s?.toLowerCase().includes(q.toLowerCase()))).slice(0, 200), [rows, q]);
  const n = Object.values(picked).filter(Boolean).length;

  async function run() {
    if (!session) return;
    setBusy(true); setError(null);
    try {
      let created = 0;
      for (const r of rows.filter((x) => picked[x.id])) {
        const id = await createContact(session.user.id, { name: r.name, headline: r.title ?? '', company: r.company ?? '', email: r.email, how_met: 'From phone contacts', relationship: 'acquaintance', relationship_source: 'phone_contacts', relationship_status: 'suggested' });
        await addEvidence(session.user.id, id, 'phone_contacts', `Phone contact${r.company ? ` at ${r.company}` : ''}${r.title ? `, ${r.title}` : ''}`);
        created++;
      }
      setDone(`${created} card${created === 1 ? '' : 's'} added. Relationships are marked unconfirmed until you say how you know them.`);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Screen footer={n && !done ? <Button variant="primary" size="sm" fullWidth label={busy ? 'Importing…' : `Import ${n} card${n === 1 ? '' : 's'}`} disabled={busy} onPress={run} /> : undefined}>
      <ScreenHeader left={<Back />} title="Choose phone contacts" subtitle="Only the people you pick are imported. Names, emails, and companies only; nothing is uploaded until you tap Import." />
      {unsupported ? <Notice tone="cautionInk">Phone contacts are only available in the iOS and Android apps. Use a CSV import here.</Notice> : null}
      {perm === 'denied' ? <Notice tone="cautionInk">Contacts permission is off. Allow it in system Settings to pick people here.</Notice> : null}
      {error ? <Notice tone="dangerInk">{error}</Notice> : null}
      {done ? <Section label="Done"><EmptyRow title={done} actionLabel="See your cards" onPress={() => router.replace('/network')} /></Section> : null}
      {perm === 'granted' && !done ? (
        <Section label={`${rows.length} contacts`}>
          <Field label="Search" placeholder={`Search ${rows.length} contacts`} value={q} onChangeText={setQ} accessibilityLabel="Search contacts" />
          {visible.length === 0 ? <EmptyRow title="No contacts match." /> : (
            <Group>
              {visible.map((r) => <Row key={r.id} title={r.name} titleVariant="rowName" subtitle={[r.title, r.company, r.email].filter(Boolean).join(' · ') || undefined} trailing={<Toggle value={!!picked[r.id]} accessibilityLabel={`Import ${r.name}`} onValueChange={() => setPicked((p) => ({ ...p, [r.id]: !p[r.id] }))} />} />)}
            </Group>
          )}
        </Section>
      ) : null}
    </Screen>
  );
}
