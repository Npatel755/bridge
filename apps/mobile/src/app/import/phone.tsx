import * as Contacts from 'expo-contacts';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { Button, Card, CheckRow, Field, Flag, Notice, Screen, ScreenTitle, T, TopBar } from '@/components';
import { errorMessage } from '@/lib/api';
import { addEvidence, createContact } from '@/lib/contacts-data';
import { useSession } from '@/lib/session';

interface Row { id: string; name: string; email: string | null; company: string | null; title: string | null }

export default function ImportPhone() {
  const { session } = useSession();
  const [perm, setPerm] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [rows, setRows] = useState<Row[]>([]);
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
  useEffect(() => { if (!unsupported) load(); }, [unsupported]);
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
    <>
      <TopBar onBack={() => router.back()} title="Phone contacts" />
      <Screen cta={n && !done ? <Button variant="primary" size="lg" title={`Import ${n} card${n === 1 ? '' : 's'}`} loading={busy} onPress={run} /> : undefined}>
        <Flag label="Only the people you pick are imported" />
        <ScreenTitle title="Choose phone contacts" caption="Names, emails, and companies only. Nothing is uploaded until you tap Import." />
        {unsupported ? <Notice>Phone contacts are only available in the iOS and Android apps. Use a CSV import here.</Notice> : null}
        {perm === 'denied' ? <Notice>Contacts permission is off. Allow it in system Settings to pick people here.</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
        {done ? <Card><T variant="body">{done}</T><Button size="sm" title="See your cards" onPress={() => router.replace('/network')} style={{ alignSelf: 'flex-start' }} /></Card> : null}
        {perm === 'granted' && !done ? (
          <>
            <Field placeholder={`Search ${rows.length} contacts`} value={q} onChangeText={setQ} />
            <Card padded={false}>
              {visible.map((r) => <CheckRow key={r.id} checked={!!picked[r.id]} onToggle={() => setPicked((p) => ({ ...p, [r.id]: !p[r.id] }))} title={r.name} subtitle={[r.title, r.company, r.email].filter(Boolean).join(' · ') || undefined} />)}
            </Card>
          </>
        ) : null}
      </Screen>
    </>
  );
}
