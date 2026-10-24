import type { ImportedEdge, ImportedPerson } from '@bridge/plugin-sdk';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { BText, Button, EmptyRow, Group, PersonRow, Row, Screen, ScreenHeader, Section, Tag, TagList } from '@/bridge-design-system';
import { Back, Loading, Notice, Stack, surnameInitial } from '@/components/shared';
import { useAsync } from '@/hooks/use-async';
import { api, errorMessage } from '@/lib/api';
import type { PluginList } from '@/app/plugins';

type PreviewPerson = ImportedPerson & { duplicate: { existingId: string | null; kind: string; strength: string } | null };
interface Preview { jobId: string; accountId: string; preview: PreviewPerson[]; edges: ImportedEdge[]; rejected: { index: number; reason: string }[]; warnings: string[]; stats: { people: number; edges: number; rejected: number; duplicates: number; followers: number }; manifest: { name: string; limitations?: string[]; description?: string } }

const REL_LABEL: Record<string, string> = { mutual_connection: 'Mutual connection', follower: 'Follows you', following: 'You follow', personal: 'Personal (needs confirmation)', colleague: 'Colleague (needs confirmation)', unknown: 'Unknown' };

export default function PluginDetail() {
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

  const footer = preview && !done ? <Button variant="primary" size="sm" fullWidth label={busy === 'import' ? 'Importing…' : `Import ${accepted} card${accepted === 1 ? '' : 's'}`} disabled={!accepted || !!busy} onPress={runImport} />
    : isFile && file && !preview && !done ? <Button variant="primary" size="sm" fullWidth label={busy === 'preview' ? 'Reading…' : 'Preview this file'} disabled={!!busy} onPress={runPreview} /> : undefined;
  return (
    <Screen footer={footer}>
      <ScreenHeader left={<Back />} title={plugin ? plugin.name.replace('LinkedIn export', 'Import from LinkedIn') : 'Plugin'}
        subtitle={plugin ? (file && preview ? `${file.name}, ${preview.stats.people} people. Nothing is saved until you import.` : `${plugin.description} ${isFile ? 'Export importer, not a live connection.' : isLinkedInApi ? 'Verifies your own profile only.' : 'Community connector, runs on the server.'}`) : undefined} />
      {!plugin && list.loading ? <Loading /> : null}
      {error ? <Notice tone="dangerInk">{error}</Notice> : null}
      {done ? <Section label="Done"><EmptyRow title={done} actionLabel="See your cards" onPress={() => router.replace('/network')} /></Section> : null}
      {plugin ? (
        <>
          {isFile && !preview && !done ? (
            <>
              <Section label="What a LinkedIn export has">
                <Group>
                  {[['Names', true], ['Profile links', true], ['Companies', true], ['Titles', true], ['Skills: not included', false], ['Followers: not available', false]].map(([l, ok]) => <Row key={String(l)} title={`${ok ? '✓' : '–'} ${l}`} titleVariant="label" />)}
                </Group>
                <BText variant="caption" color="inkFaint">Imported cards are marked “LinkedIn export” and stay private to you. Titles become suggested tags, not confirmed skills.</BText>
              </Section>
              <Section label="Your file">
                <Stack>
                  <BText variant="secondary" color="inkSoft">In LinkedIn: Settings → Data privacy → Get a copy of your data → Connections. Upload the Connections.csv here.</BText>
                  <Button size="sm" fullWidth variant={file ? 'secondary' : 'primary'} label={file ? `Chosen: ${file.name}` : 'Choose Connections.csv'} onPress={pick} />
                </Stack>
              </Section>
            </>
          ) : null}

          {isLinkedInApi ? (
            <Section label="Sign in with LinkedIn">
              <Stack>
                <BText variant="body">LinkedIn&apos;s public API does not share your connections with apps. Sign in with LinkedIn can only confirm that a LinkedIn profile is yours.</BText>
                {list.data?.env.linkedinOAuth ? <Button size="sm" fullWidth label="Verify my LinkedIn profile" onPress={() => setError('OAuth verification is wired on the server but not enabled in this build.')} /> : <Notice tone="cautionInk">Not configured on this deployment (LINKEDIN_CLIENT_ID is missing). The export importer works without it.</Notice>}
              </Stack>
            </Section>
          ) : null}

          {!isFile && !isLinkedInApi && !preview && !done ? (
            <Section label="How it works">
              <Stack>
                <BText variant="body">This connector returns people and relationships as JSON. Bridge checks every record, keeps followers separate from people you know, and never treats a follow as expertise.</BText>
                {plugin.manifest.limitations?.map((l, i) => <BText key={i} variant="secondary" color="inkSoft">• {l}</BText>)}
                <Button size="sm" fullWidth variant="primary" label={busy === 'preview' ? 'Reading…' : 'Preview what it would import'} disabled={!!busy} onPress={runPreview} />
              </Stack>
            </Section>
          ) : null}

          {preview && counts ? (
            <>
              <Section label="What would happen">
                <Group>
                  <Row title={`${counts.create} new cards`} titleVariant="label" />
                  <Row title={`${counts.merge} added to existing cards`} titleVariant="label" />
                  <Row title={`${counts.review} to review`} titleVariant="label" subtitle={counts.review ? 'Name-only matches are skipped unless you choose.' : undefined} subtitleColor="cautionInk" />
                </Group>
                <TagList>
                  <Tag label={`${preview.stats.followers} follower-only, never warm routes`} />
                  {preview.stats.rejected ? <Tag label={`${preview.stats.rejected} rejected by validation`} variant="suggested" /> : null}
                  {preview.edges.length ? <Tag label={`${preview.edges.length} links, unconfirmed`} /> : null}
                </TagList>
                {preview.warnings.map((w, i) => <Notice key={i} tone="cautionInk">{w}</Notice>)}
              </Section>
              {preview.preview.some((p) => p.duplicate) ? (
                <Section label="Is this the same person?">
                  <Group dashed>
                    {preview.preview.filter((p) => p.duplicate).map((p) => {
                      const k = keyFor(p); const d = p.duplicate!;
                      const reason = d.kind === 'email' ? 'Same email' : d.kind === 'profile_url' ? 'Same profile link' : d.kind === 'name_and_company' ? 'Same name and company' : 'Name only';
                      return <Row key={k} title={p.name} titleVariant="rowName" overline={reason} subtitle={d.strength === 'strong' ? 'Strong match with one of your cards. Importing adds this record to that card.' : 'Only the name matches. Importing creates a separate card; leave it skipped to decide later.'}
                        trailing={<Button size="sm" variant={accept[k] ? 'primary' : 'secondary'} label={accept[k] ? (d.strength === 'strong' ? 'Adding' : 'New card') : 'Skipped'} onPress={() => setAccept((a) => ({ ...a, [k]: !a[k] }))} />} />;
                    })}
                  </Group>
                </Section>
              ) : null}
              <Section label="Preview">
                <Group>
                  {preview.preview.filter((p) => !p.duplicate).slice(0, 10).map((p) => (
                    <PersonRow key={keyFor(p)} name={p.name} reason={[p.headline, p.company].filter(Boolean).join(', ') || 'No headline'} overline={accept[keyFor(p)] ? 'Will import' : 'Skipped'} route={{ kind: 'suggested', label: REL_LABEL[p.relationship] ?? p.relationship }} tab={surnameInitial(p.name)} onPress={() => setAccept((a) => ({ ...a, [keyFor(p)]: !a[keyFor(p)] }))} />
                  ))}
                </Group>
                {preview.preview.some((p) => p.suggestedTags?.length) ? <TagList>{preview.preview.flatMap((p) => p.suggestedTags ?? []).slice(0, 8).map((t, i) => <Tag key={i} label={t.label} variant="suggested" />)}</TagList> : null}
                {preview.rejected.length ? <BText variant="caption" color="inkFaint">Rejected rows: {preview.rejected.slice(0, 5).map((r) => `#${r.index} ${r.reason}`).join('; ')}</BText> : null}
              </Section>
            </>
          ) : null}

          {account ? (
            <Section label="Connection">
              <Stack>
                <BText variant="secondary" color="inkSoft">{account.display_label} · {account.status}{account.last_sync_at ? ` · last import ${new Date(account.last_sync_at).toLocaleString()}` : ''}</BText>
                {account.last_error ? <Notice tone="dangerInk">{account.last_error}</Notice> : null}
                {confirm === 'disconnect' ? <BText variant="secondary" color="inkSoft">Removes stored credentials and every card that exists only because of this import. Cards you have added notes to are kept, and the imported evidence on them is removed.</BText> : null}
                {confirm === 'disconnect' ? <Button size="sm" fullWidth variant="danger" label={busy === 'disconnect' ? 'Disconnecting…' : 'Yes, disconnect'} disabled={!!busy} onPress={disconnect} /> : null}
                <Button size="sm" fullWidth variant={confirm ? 'ghost' : 'danger'} label={confirm ? 'Keep connection' : 'Disconnect and remove imported data'} onPress={() => setConfirm(confirm ? null : 'disconnect')} />
              </Stack>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
