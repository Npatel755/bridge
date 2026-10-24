import type { ImportedEdge, ImportedPerson } from '@bridge/plugin-sdk';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, CardSection, EntryCard, Flag, Loading, Notice, Row, Screen, ScreenTitle, Sheet, T, Tag, TagRow, TopBar } from '@/components';
import { useTheme } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { api, errorMessage } from '@/lib/api';
import type { PluginList } from '@/app/plugins';

type PreviewPerson = ImportedPerson & { duplicate: { existingId: string | null; kind: string; strength: string } | null };
interface Preview { jobId: string; accountId: string; preview: PreviewPerson[]; edges: ImportedEdge[]; rejected: { index: number; reason: string }[]; warnings: string[]; stats: { people: number; edges: number; rejected: number; duplicates: number; followers: number }; manifest: { name: string; limitations?: string[]; description?: string } }

const REL_LABEL: Record<string, string> = { mutual_connection: 'Mutual connection', follower: 'Follows you', following: 'You follow', personal: 'Personal (needs confirmation)', colleague: 'Colleague (needs confirmation)', unknown: 'Unknown' };

export default function PluginDetail() {
  const { colors, space } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useAsync(() => api.plugins<PluginList>({ action: 'list' }), [id]);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [accept, setAccept] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'disconnect' | null>(null);

  const plugin = list.data?.plugins.find((p) => p.id === id);
  const account = list.data?.accounts.find((a) => a.plugin_id === id && a.status !== 'disconnected');
  const isFile = plugin?.manifest.auth.type === 'file';
  const isLinkedInApi = id === 'linkedin-api';
  const keyFor = (p: ImportedPerson) => p.providerId ?? `name:${p.name.toLowerCase().trim().replace(/\s+/g, ' ')}`;

  async function pick() {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain'], copyToCacheDirectory: true });
      if (res.canceled) return;
      const a = res.assets[0];
      if ((a.size ?? 0) > 5_000_000) throw new Error('That file is over 5 MB.');
      setFile({ name: a.name, text: a.file ? await a.file.text() : await new File(a.uri).text() });
      setPreview(null);
    } catch (e) { setError(errorMessage(e)); }
  }
  async function runPreview() {
    setBusy('preview'); setError(null);
    try {
      const r = await api.plugins<Preview>({ action: 'preview', pluginId: id, fileText: file?.text, fileName: file?.name });
      setPreview(r);
      const acc: Record<string, boolean> = {};
      for (const p of r.preview) acc[keyFor(p)] = !(p.duplicate && p.duplicate.strength === 'weak');
      setAccept(acc);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }
  async function runImport() {
    setBusy('import'); setError(null);
    try {
      const r = await api.plugins<{ stats: Record<string, number> }>({ action: 'import', pluginId: id, fileText: file?.text, fileName: file?.name, accept: Object.entries(accept).filter(([, v]) => v).map(([k]) => k) });
      setDone(`${r.stats.created ?? 0} new cards, ${r.stats.merged ?? 0} added to existing cards, ${r.stats.ambiguous ?? 0} left for review, ${r.stats.edgesCreated ?? 0} links between cards.`);
      setPreview(null); list.reload();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }
  async function disconnect() {
    setBusy('disconnect'); setError(null);
    try { if (account) await api.plugins({ action: 'disconnect', accountId: account.id, deleteData: true }); setConfirm(null); list.reload(); setDone('Disconnected. Cards that existed only because of this import were removed; cards with your own notes were kept.'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }

  const counts = preview ? { create: preview.preview.filter((p) => accept[keyFor(p)] && !(p.duplicate?.strength === 'strong')).length, merge: preview.preview.filter((p) => accept[keyFor(p)] && p.duplicate?.strength === 'strong').length, review: preview.preview.filter((p) => p.duplicate && !accept[keyFor(p)]).length } : null;
  const accepted = Object.values(accept).filter(Boolean).length;

  return (
    <>
      <TopBar onBack={() => router.back()} title="Plugins" />
      <Screen cta={preview && !done ? <Button variant="primary" size="lg" title={`Import ${accepted} card${accepted === 1 ? '' : 's'}`} loading={busy === 'import'} disabled={!accepted} onPress={runImport} /> : isFile && file && !preview && !done ? <Button variant="primary" size="lg" title="Preview this file" loading={busy === 'preview'} onPress={runPreview} /> : undefined}>
        {!plugin && list.loading ? <Loading /> : null}
        {plugin ? (
          <>
            <Flag label={isFile ? 'Export importer, not a live connection' : isLinkedInApi ? 'Verifies your own profile only' : 'Community connector, runs on the server'} />
            <ScreenTitle title={plugin.name.replace('LinkedIn export', 'Import from LinkedIn')} caption={file && preview ? `${file.name}, ${preview.stats.people} people. Nothing is saved until you import.` : plugin.description} />
            {error ? <Notice>{error}</Notice> : null}
            {done ? <Card><T variant="body">{done}</T><Button size="sm" title="See your cards" onPress={() => router.replace('/network')} style={{ alignSelf: 'flex-start' }} /></Card> : null}

            {isFile && !preview && !done ? (
              <>
                <Card>
                  <T variant="name">What a LinkedIn export has</T>
                  <View style={{ gap: space[1] }}>
                    {[['Names', true], ['Profile links', true], ['Companies', true], ['Titles', true], ['Skills: not included', false], ['Followers: not available', false]].map(([l, ok]) => <T key={String(l)} variant="body" color={ok ? 'ink' : 'inkSoft'}>{ok ? '✓' : '–'} {l}</T>)}
                  </View>
                  <T variant="caption" color="inkSoft">Imported cards are marked “LinkedIn export” and stay private to you. Titles become suggested tags, not confirmed skills. Add notes later to fill in what people are good at.</T>
                </Card>
                <Card>
                  <T variant="body">In LinkedIn: Settings → Data privacy → Get a copy of your data → Connections. Upload the Connections.csv here.</T>
                  <Button variant={file ? 'secondary' : 'primary'} title={file ? `Chosen: ${file.name}` : 'Choose Connections.csv'} onPress={pick} />
                </Card>
              </>
            ) : null}

            {isLinkedInApi ? (
              <Card>
                <T variant="body">LinkedIn's public API does not share your connections with apps. Sign in with LinkedIn can only confirm that a LinkedIn profile is yours.</T>
                {list.data?.env.linkedinOAuth ? <Button title="Verify my LinkedIn profile" onPress={() => setError('OAuth verification is wired on the server but not enabled in this build.')} /> : <Notice>Not configured on this deployment (LINKEDIN_CLIENT_ID is missing). The export importer works without it.</Notice>}
              </Card>
            ) : null}

            {!isFile && !isLinkedInApi && !preview && !done ? (
              <Card>
                <T variant="body">This connector returns people and relationships as JSON. Bridge checks every record, keeps followers separate from people you know, and never treats a follow as expertise.</T>
                {plugin.manifest.limitations?.map((l, i) => <T key={i} variant="caption" color="inkSoft">• {l}</T>)}
                <Button variant="primary" title="Preview what it would import" loading={busy === 'preview'} onPress={runPreview} />
              </Card>
            ) : null}

            {preview && counts ? (
              <>
                <Row>
                  {[{ n: counts.create, l: 'new cards' }, { n: counts.merge, l: 'add to cards' }, { n: counts.review, l: 'to review' }].map((c) => (
                    <Card key={c.l} style={{ flex: 1, backgroundColor: c.l === 'to review' && c.n ? colors.cautionWash : colors.card }}><T variant="title">{c.n}</T><T variant="caption" color={c.l === 'to review' && c.n ? 'cautionInk' : 'inkSoft'}>{c.l}</T></Card>
                  ))}
                </Row>
                <TagRow>
                  <Flag label={`${preview.stats.followers} follower-only records, never shown as warm routes`} />
                  {preview.stats.rejected ? <Flag label={`${preview.stats.rejected} rejected by validation`} tone="caution" /> : null}
                  {preview.edges.length ? <Flag label={`${preview.edges.length} links between people, marked unconfirmed`} /> : null}
                </TagRow>
                {preview.warnings.map((w, i) => <T key={i} variant="caption" color="cautionInk">{w}</T>)}
                {preview.preview.some((p) => p.duplicate) ? <T variant="title">Is this the same person?</T> : null}
                {preview.preview.filter((p) => p.duplicate).map((p) => {
                  const k = keyFor(p); const d = p.duplicate!;
                  const reason = d.kind === 'email' ? 'Same email' : d.kind === 'profile_url' ? 'Same profile link' : d.kind === 'name_and_company' ? 'Same name and company' : 'Name only';
                  return (
                    <EntryCard key={k} name={p.name} role={[p.headline, p.company].filter(Boolean).join(', ')} headRight={<T variant="label" style={{ color: d.strength === 'strong' ? colors.confirmInk : colors.cautionInk }}>{reason}</T>}>
                      <CardSection>
                        <T variant="caption" color="inkSoft">{d.strength === 'strong' ? 'Strong match with one of your cards. Importing adds this record to that card.' : 'Only the name matches. Importing will create a separate card; leave it unchecked to decide later.'}</T>
                        <Row><Button size="sm" variant={accept[k] ? 'primary' : 'secondary'} title={d.strength === 'strong' ? 'Add to their card' : 'New card'} onPress={() => setAccept((a) => ({ ...a, [k]: true }))} /><Button size="sm" variant="ghost" title={accept[k] ? 'Skip' : 'Skipped'} onPress={() => setAccept((a) => ({ ...a, [k]: false }))} /></Row>
                      </CardSection>
                    </EntryCard>
                  );
                })}
                <T variant="title">Preview</T>
                {preview.preview.filter((p) => !p.duplicate).slice(0, 10).map((p, i) => (
                  <EntryCard key={keyFor(p)} name={p.name} role={[p.headline, p.company].filter(Boolean).join(', ')} route={{ kind: 'suggested', label: REL_LABEL[p.relationship] ?? p.relationship }} collapsed tabOffset={Math.min(i, 3) * 44} onPress={() => setAccept((a) => ({ ...a, [keyFor(p)]: !a[keyFor(p)] }))} accessibilityLabel={`${p.name}, ${accept[keyFor(p)] ? 'will be imported' : 'skipped'}. Tap to toggle.`} />
                ))}
                {preview.preview.some((p) => p.suggestedTags?.length) ? <TagRow>{preview.preview.flatMap((p) => p.suggestedTags ?? []).slice(0, 8).map((t, i) => <Tag key={i} label={t.label} state="suggested" />)}</TagRow> : null}
                {preview.rejected.length ? <T variant="caption" color="inkSoft">Rejected rows: {preview.rejected.slice(0, 5).map((r) => `#${r.index} ${r.reason}`).join('; ')}</T> : null}
              </>
            ) : null}

            {account ? (
              <Card style={{ marginTop: space[3] }}>
                <T variant="name">Connection</T>
                <T variant="caption" color="inkSoft">{account.display_label} · {account.status}{account.last_sync_at ? ` · last import ${new Date(account.last_sync_at).toLocaleString()}` : ''}</T>
                {account.last_error ? <Notice>{account.last_error}</Notice> : null}
                <Button variant="danger" title="Disconnect and remove imported data" onPress={() => setConfirm('disconnect')} />
              </Card>
            ) : null}
            <Sheet visible={confirm === 'disconnect'} onClose={() => setConfirm(null)} title={`Disconnect ${plugin.name}?`}>
              <T variant="body" color="inkSoft">Removes stored credentials and every card that exists only because of this import. Cards you have added notes to are kept, and the imported evidence on them is removed.</T>
              <Button variant="danger" title="Disconnect" loading={busy === 'disconnect'} onPress={disconnect} />
            </Sheet>
          </>
        ) : null}
      </Screen>
    </>
  );
}
