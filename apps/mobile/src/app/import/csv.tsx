import { CONTACT_FIELDS, detectDuplicates, findHeaderRow, guessMapping, mapRows, parseCsv, type ColumnMapping, type ContactField, type DuplicateCandidate, type MappedContact } from '@bridge/core';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, CardSection, EntryCard, Flag, Notice, Row, Screen, ScreenTitle, T, Tag, TagRow, TopBar } from '@/components';
import { useTheme } from '@/constants/theme';
import { errorMessage } from '@/lib/api';
import { addClaims, addEvidence, createContact } from '@/lib/contacts-data';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const FIELD_LABEL: Record<ContactField, string> = { firstName: 'First name', lastName: 'Last name', fullName: 'Full name', email: 'Email', phone: 'Phone', company: 'Company', title: 'Title', profileUrl: 'Profile link', city: 'City', notes: 'Notes', skills: 'Skills', interests: 'Interests', connectedOn: 'Connected on', howMet: 'How met' };
const MAX_BYTES = 5_000_000;

export default function ImportCsv() {
  const { colors, space } = useTheme();
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
    <>
      <TopBar onBack={() => router.back()} title="Import" />
      <Screen cta={mapped.length && !done ? <Button variant="primary" size="lg" title={`Import ${counts.create + counts.merge} card${counts.create + counts.merge === 1 ? '' : 's'}`} loading={busy} disabled={!counts.create && !counts.merge} onPress={run} /> : undefined}>
        <Flag label="File import, stays private to you" />
        <ScreenTitle title="Import a CSV" caption={fileName ? `${fileName}, ${mapped.length} people. Nothing is saved until you import.` : 'Any spreadsheet with names. You map the columns and review duplicates first.'} />
        {error ? <Notice>{error}</Notice> : null}
        {done ? <Card><T variant="body">{done}</T><Row><Button size="sm" title="See your cards" onPress={() => router.replace('/network')} /><Button variant="ghost" size="sm" title="Import another file" onPress={() => { setRows([]); setDone(null); setFileName(null); }} /></Row></Card> : null}
        {!rows.length && !done ? <Button variant="primary" title="Choose a CSV file" onPress={pick} /> : null}
        {rows.length && !done ? (
          <>
            <Card>
              <T variant="name">Columns</T>
              <T variant="caption" color="inkSoft">Tap a field to change which column feeds it. Unmapped fields are left blank.</T>
              <TagRow>{CONTACT_FIELDS.map((f) => <Tag key={f} label={`${FIELD_LABEL[f]}: ${mapping[f] !== undefined ? headers[mapping[f]!] || `col ${mapping[f]! + 1}` : '—'}`} state={editingField === f ? 'selected' : mapping[f] !== undefined ? 'stated' : 'suggested'} onPress={() => setEditingField(editingField === f ? null : f)} />)}</TagRow>
              {editingField ? (
                <View style={{ gap: space[1] }}>
                  <T variant="label" color="inkSoft">Column for {FIELD_LABEL[editingField]}</T>
                  <TagRow>
                    <Tag label="None" state={mapping[editingField] === undefined ? 'selected' : 'stated'} onPress={() => { setMapping((m) => { const n = { ...m }; delete n[editingField]; return n; }); setEditingField(null); }} />
                    {headers.map((h, i) => <Tag key={i} label={h || `col ${i + 1}`} state={mapping[editingField] === i ? 'selected' : 'stated'} onPress={() => { setMapping((m) => ({ ...m, [editingField]: i })); setEditingField(null); }} />)}
                  </TagRow>
                </View>
              ) : null}
            </Card>
            <Row>
              {[{ n: counts.create, l: 'new cards' }, { n: counts.merge, l: 'add to cards' }, { n: counts.review, l: 'to review' }].map((c) => (
                <Card key={c.l} style={{ flex: 1, backgroundColor: c.l === 'to review' && c.n ? colors.cautionWash : colors.card }}><T variant="title">{c.n}</T><T variant="caption" color={c.l === 'to review' && c.n ? 'cautionInk' : 'inkSoft'}>{c.l}</T></Card>
              ))}
            </Row>
            {dupes.length ? <T variant="title">Is this the same person?</T> : null}
            {mapped.filter((m) => dupeByRow.has(m.rowIndex)).slice(0, 30).map((m) => {
              const d = dupeByRow.get(m.rowIndex)!; const ex = existing.find((e) => e.id === d.existingId); const dec = decision(m, d);
              const reason = d.kind === 'email' ? 'Same email' : d.kind === 'profile_url' ? 'Same profile link' : d.kind === 'name_and_company' ? 'Same name and company' : `Name only${d.otherRowIndex !== null ? ', also in this file' : ''}`;
              return (
                <EntryCard key={m.rowIndex} name={m.displayName} role={[m.title, m.company].filter(Boolean).join(', ')} headRight={<T variant="label" style={{ color: d.strength === 'strong' ? colors.confirmInk : colors.cautionInk }}>{reason}</T>}>
                  <CardSection>
                    {ex ? <T variant="caption" color="inkSoft">Existing card: {ex.displayName}{ex.company ? `, ${ex.company}` : ''}</T> : <T variant="caption" color="inkSoft">Another row in this file has the same name.</T>}
                    <Row wrap>
                      {ex ? <Button size="sm" variant={dec === 'merge' ? 'primary' : 'secondary'} title={`Add to ${ex.displayName.split(' ')[0]}'s card`} onPress={() => setDecisions((x) => ({ ...x, [m.rowIndex]: 'merge' }))} /> : null}
                      <Button size="sm" variant={dec === 'separate' ? 'primary' : 'secondary'} title="Keep separate" onPress={() => setDecisions((x) => ({ ...x, [m.rowIndex]: 'separate' }))} />
                      <Button size="sm" variant={dec === 'skip' ? 'ghost' : 'ghost'} title={dec === 'skip' ? 'Skipped' : 'Skip'} onPress={() => setDecisions((x) => ({ ...x, [m.rowIndex]: 'skip' }))} />
                    </Row>
                  </CardSection>
                </EntryCard>
              );
            })}
            <T variant="title">Preview</T>
            {mapped.slice(0, 8).map((m, i) => <EntryCard key={m.rowIndex} name={m.displayName} role={[m.title, m.company].filter(Boolean).join(', ')} collapsed tabOffset={Math.min(i, 3) * 44} />)}
            {mapped.length > 8 ? <T variant="caption" color="inkSoft">and {mapped.length - 8} more. Rows without a name were dropped; links that are not http(s) were removed.</T> : null}
          </>
        ) : null}
      </Screen>
    </>
  );
}
