import { CONTACT_FIELDS, detectDuplicates, findHeaderRow, guessMapping, mapRows, parseCsv, type ColumnMapping, type ContactField, type DuplicateCandidate, type MappedContact } from '@bridge/core';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { BText, Button, EmptyRow, Group, PersonRow, Row, Screen, ScreenHeader, Section, Tag, TagList } from '@/bridge-design-system';
import { Back, Notice, Stack, surnameInitial } from '@/components/shared';
import { errorMessage } from '@/lib/api';
import { addClaims, addEvidence, createContact } from '@/lib/contacts-data';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const FIELD_LABEL: Record<ContactField, string> = { firstName: 'First name', lastName: 'Last name', fullName: 'Full name', email: 'Email', phone: 'Phone', company: 'Company', title: 'Title', profileUrl: 'Profile link', city: 'City', notes: 'Notes', skills: 'Skills', interests: 'Interests', connectedOn: 'Connected on', howMet: 'How met' };
const MAX_BYTES = 5_000_000;

export default function ImportCsv() {
  const { session } = useSession();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [editingField, setEditingField] = useState<ContactField | null>(null);
  const [existing, setExisting] = useState<{ id: string; displayName: string; email: string | null; company: string | null; profileUrl: string | null }[]>([]);
  const [decisions, setDecisions] = useState<Record<number, 'merge' | 'separate' | 'skip'>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function pick() {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled) return;
      const asset = res.assets[0];
      if ((asset.size ?? 0) > MAX_BYTES) throw new Error('That file is over 5 MB. Export a smaller list.');
      const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
      const parsed = parseCsv(text);
      const h = findHeaderRow(parsed);
      setRows(parsed); setHeaderIdx(h); setMapping(guessMapping(parsed[h] ?? [])); setFileName(asset.name); setDecisions({});
      const { data } = await supabase.from('contacts').select('id, name, email, company, links').eq('archived', false);
      setExisting((data ?? []).map((c) => ({ id: c.id, displayName: c.name, email: c.email, company: c.company, profileUrl: (c.links as { url?: string }[] | null)?.find((l) => l.url)?.url ?? null })));
    } catch (e) { setError(errorMessage(e)); }
  }

  const headers = rows[headerIdx] ?? [];
  const mapped: MappedContact[] = useMemo(() => (rows.length ? mapRows(rows.slice(headerIdx + 1), mapping) : []), [rows, headerIdx, mapping]);
  const dupes = useMemo(() => detectDuplicates(mapped, existing), [mapped, existing]);
  const dupeByRow = useMemo(() => new Map(dupes.map((d) => [d.rowIndex, d])), [dupes]);
  const decision = (m: MappedContact, d?: DuplicateCandidate) => decisions[m.rowIndex] ?? (d ? (d.strength === 'strong' && d.existingId ? 'merge' : 'skip') : 'separate');
  const counts = useMemo(() => {
    let create = 0, merge = 0, review = 0;
    for (const m of mapped) { const d = dupeByRow.get(m.rowIndex); const dec = decision(m, d); if (dec === 'merge') merge++; else if (dec === 'separate') create++; else review++; }
    return { create, merge, review };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapped, dupeByRow, decisions]);

  async function run() {
    if (!session) return;
    setBusy(true); setError(null);
    try {
      const me = session.user.id; let created = 0, merged = 0;
      for (const m of mapped) {
        const d = dupeByRow.get(m.rowIndex); const dec = decision(m, d);
        if (dec === 'skip') continue;
        let id: string;
        if (dec === 'merge' && d?.existingId) { id = d.existingId; merged++; }
        else { id = await createContact(me, { name: m.displayName, headline: m.title ?? '', company: m.company ?? '', location: m.city ?? '', email: m.email, how_met: m.howMet ?? `Imported from ${fileName}`, met_at: m.connectedOn, relationship: 'acquaintance', relationship_source: 'csv_import', relationship_status: 'suggested', links: m.profileUrl ? [{ label: 'Profile', url: m.profileUrl }] : [] }); created++; }
        const evId = await addEvidence(me, id, 'csv_import', `${fileName}: ${[m.title, m.company, m.notes].filter(Boolean).join(', ') || m.displayName}`, { url: m.profileUrl });
        await addClaims(me, id, evId, [...m.skills.map((s) => ({ kind: 'skill', label: s, status: 'confirmed' as const })), ...m.interests.map((s) => ({ kind: 'interest', label: s, status: 'confirmed' as const })), ...(m.company ? [{ kind: 'org', label: m.company }] : [])]);
      }
      setDone(`${created} new card${created === 1 ? '' : 's'}, ${merged} added to existing cards.`);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Screen footer={mapped.length && !done ? <Button variant="primary" size="sm" fullWidth label={busy ? 'Importing…' : `Import ${counts.create + counts.merge} card${counts.create + counts.merge === 1 ? '' : 's'}`} disabled={busy || (!counts.create && !counts.merge)} onPress={run} /> : undefined}>
      <ScreenHeader left={<Back />} title="Import a CSV" subtitle={fileName ? `${fileName}, ${mapped.length} people. Nothing is saved until you import. Stays private to you.` : 'Any spreadsheet with names. You map the columns and review duplicates first. Stays private to you.'} />
      {error ? <Notice tone="dangerInk">{error}</Notice> : null}
      {done ? <Section label="Done"><Group><EmptyRow title={done} actionLabel="See your cards" onPress={() => router.replace('/network')} /><Row title="Import another file" titleVariant="label" chevron onPress={() => { setRows([]); setDone(null); setFileName(null); }} /></Group></Section> : null}
      {!rows.length && !done ? <Section label="Your file"><Button variant="primary" size="sm" fullWidth label="Choose a CSV file" onPress={pick} /></Section> : null}
      {rows.length && !done ? (
        <>
          <Section label="Columns">
            <Stack>
              <BText variant="secondary" color="inkSoft">Tap a field to change which column feeds it. Unmapped fields are left blank.</BText>
              <TagList>{CONTACT_FIELDS.map((f) => <Tag key={f} label={`${FIELD_LABEL[f]}: ${mapping[f] !== undefined ? headers[mapping[f]!] || `col ${mapping[f]! + 1}` : '—'}`} variant={editingField === f ? 'selected' : mapping[f] !== undefined ? 'stated' : 'suggested'} onPress={() => setEditingField(editingField === f ? null : f)} />)}</TagList>
              {editingField ? (
                <Group dashed>
                  <Row title={`Column for ${FIELD_LABEL[editingField]}`} titleVariant="label" />
                  <Row title={<TagList>
                    <Tag label="None" variant={mapping[editingField] === undefined ? 'selected' : 'stated'} onPress={() => { setMapping((m) => { const n = { ...m }; delete n[editingField]; return n; }); setEditingField(null); }} />
                    {headers.map((h, i) => <Tag key={i} label={h || `col ${i + 1}`} variant={mapping[editingField] === i ? 'selected' : 'stated'} onPress={() => { setMapping((m) => ({ ...m, [editingField]: i })); setEditingField(null); }} />)}
                  </TagList>} />
                </Group>
              ) : null}
            </Stack>
          </Section>
          <Section label="What would happen">
            <Group>
              <Row title={`${counts.create} new cards`} titleVariant="label" />
              <Row title={`${counts.merge} added to existing cards`} titleVariant="label" />
              <Row title={`${counts.review} to review`} titleVariant="label" subtitle={counts.review ? 'Decide below before importing.' : undefined} subtitleColor="cautionInk" />
            </Group>
          </Section>
          {dupes.length ? (
            <Section label="Is this the same person?">
              <Stack>
                {mapped.filter((m) => dupeByRow.has(m.rowIndex)).slice(0, 30).map((m) => {
                  const d = dupeByRow.get(m.rowIndex)!; const ex = existing.find((e) => e.id === d.existingId); const dec = decision(m, d);
                  const reason = d.kind === 'email' ? 'Same email' : d.kind === 'profile_url' ? 'Same profile link' : d.kind === 'name_and_company' ? 'Same name and company' : `Name only${d.otherRowIndex !== null ? ', also in this file' : ''}`;
                  return (
                    <Group key={m.rowIndex} dashed>
                      <Row title={m.displayName} titleVariant="rowName" overline={reason} subtitle={ex ? `Existing card: ${ex.displayName}${ex.company ? `, ${ex.company}` : ''}` : 'Another row in this file has the same name.'} />
                      <Row title={<TagList>
                        {ex ? <Tag label={`Add to ${ex.displayName.split(' ')[0]}'s card`} variant={dec === 'merge' ? 'selected' : 'stated'} onPress={() => setDecisions((x) => ({ ...x, [m.rowIndex]: 'merge' }))} /> : null}
                        <Tag label="Keep separate" variant={dec === 'separate' ? 'selected' : 'stated'} onPress={() => setDecisions((x) => ({ ...x, [m.rowIndex]: 'separate' }))} />
                        <Tag label={dec === 'skip' ? 'Skipped' : 'Skip'} variant={dec === 'skip' ? 'selected' : 'suggested'} onPress={() => setDecisions((x) => ({ ...x, [m.rowIndex]: 'skip' }))} />
                      </TagList>} />
                    </Group>
                  );
                })}
              </Stack>
            </Section>
          ) : null}
          <Section label="Preview">
            <Group>{mapped.slice(0, 8).map((m) => <PersonRow key={m.rowIndex} name={m.displayName} reason={[m.title, m.company].filter(Boolean).join(', ') || 'No headline'} route={{ kind: 'suggested', label: 'From this file' }} tab={surnameInitial(m.displayName)} />)}</Group>
            {mapped.length > 8 ? <BText variant="caption" color="inkFaint">and {mapped.length - 8} more. Rows without a name were dropped; links that are not http(s) were removed.</BText> : null}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
