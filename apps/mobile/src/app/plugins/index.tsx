import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { BText, Button, Group, Row, Screen, ScreenHeader, Section, Tag, TagList } from '@/bridge-design-system';
import { Back, Loading, Notice, Stack } from '@/components/shared';
import { useAsync } from '@/hooks/use-async';
import { api } from '@/lib/api';

export interface PluginRow { id: string; name: string; version: string; description: string; author: string; kind: 'builtin' | 'community'; capabilities: string[]; status: string; manifest: { auth: { type: string }; limitations?: string[]; description?: string } }
export interface Installation { plugin_id: string; enabled: boolean }
export interface Account { id: string; plugin_id: string; status: string; last_sync_at: string | null; last_error: string | null; display_label: string }
export interface Job { id: string; plugin_id: string; kind: string; status: string; stats: Record<string, number> | null; error: string | null; created_at: string }
export interface PluginList { plugins: PluginRow[]; installations: Installation[]; accounts: Account[]; jobs: Job[]; env: { linkedinOAuth: boolean } }

export default function Plugins() {
  const list = useAsync(() => api.plugins<PluginList>({ action: 'list' }));
  const reload = list.reload;
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const d = list.data;
  return (
    <Screen>
      <ScreenHeader left={<Back />} title="Imports and plugins" subtitle="Every import is labeled with its source and stays private to you. Connectors run on the server, never inside the app." />
      {list.loading && !d ? <Loading /> : null}
      {list.error ? <Notice tone="dangerInk">{list.error}</Notice> : null}
      <Section label="Built in">
        <Group>
          <Row title="CSV file" titleVariant="label" subtitle="Any spreadsheet with names. Map columns, review duplicates, then import." chevron onPress={() => router.push('/import/csv')} />
          <Row title="Phone contacts" titleVariant="label" subtitle="Pick people one by one. iOS and Android only." chevron onPress={() => router.push('/import/phone')} />
        </Group>
      </Section>
      {d?.plugins.length ? (
        <Section label="Connectors">
          <Stack>
            {d.plugins.map((p) => {
              const inst = d.installations.find((x) => x.plugin_id === p.id);
              const acct = d.accounts.find((x) => x.plugin_id === p.id && x.status !== 'disconnected');
              return (
                <Group key={p.id}>
                  <Row title={p.name} titleVariant="rowName" overline={p.kind === 'builtin' ? 'Built in' : `Community · ${p.author}`} subtitle={p.description} chevron onPress={async () => { if (!inst?.enabled) await api.plugins({ action: 'install', pluginId: p.id }); router.push({ pathname: '/plugins/[id]', params: { id: p.id } }); }}
                    trailing={<Button size="sm" variant={inst?.enabled ? 'secondary' : 'primary'} label={inst?.enabled ? 'Open' : 'Install'} onPress={async () => { if (!inst?.enabled) await api.plugins({ action: 'install', pluginId: p.id }); router.push({ pathname: '/plugins/[id]', params: { id: p.id } }); }} />} />
                  <Row title={<TagList>{p.capabilities.map((c) => <Tag key={c} label={c} />)}{p.status !== 'active' ? <Tag label={p.status} variant="suggested" /> : null}</TagList>}
                    subtitle={acct ? (acct.status === 'error' ? `Last run failed: ${acct.last_error}` : acct.last_sync_at ? `Last import ${new Date(acct.last_sync_at).toLocaleString()}` : 'Connected, nothing imported yet') : undefined} subtitleColor={acct?.status === 'error' ? 'cautionInk' : 'inkSoft'}
                    trailing={inst ? <Button variant="ghost" size="sm" label="Remove" onPress={async () => { await api.plugins({ action: 'uninstall', pluginId: p.id }); reload(); }} /> : undefined} />
                </Group>
              );
            })}
          </Stack>
        </Section>
      ) : null}
      {d?.jobs.length ? (
        <Section label="Recent runs">
          <Group>
            {d.jobs.slice(0, 8).map((j) => <Row key={j.id} title={`${j.plugin_id} · ${j.kind}`} titleVariant="label" subtitle={`${new Date(j.created_at).toLocaleString()} · ${j.status}${j.stats ? ` · ${Object.entries(j.stats).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}${j.error ? ` · ${j.error}` : ''}`} subtitleColor={j.status === 'failed' ? 'cautionInk' : 'inkSoft'} />)}
          </Group>
        </Section>
      ) : null}
      <BText variant="caption" color="inkFaint">Want to add a connector? See plugins/template in the repository: a manifest, a small HTTPS JSON service, and a fixture test. Bridge validates every record and never runs plugin code on your phone.</BText>
    </Screen>
  );
}
