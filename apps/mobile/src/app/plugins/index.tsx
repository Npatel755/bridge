import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { Button, Card, Flag, Loading, Notice, Row, Screen, ScreenTitle, T, TopBar } from '@/components';
import { useTheme } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { api } from '@/lib/api';

export interface PluginRow { id: string; name: string; version: string; description: string; author: string; kind: 'builtin' | 'community'; capabilities: string[]; status: string; manifest: { auth: { type: string }; limitations?: string[]; description?: string } }
export interface Installation { plugin_id: string; enabled: boolean }
export interface Account { id: string; plugin_id: string; status: string; last_sync_at: string | null; last_error: string | null; display_label: string }
export interface Job { id: string; plugin_id: string; kind: string; status: string; stats: Record<string, number> | null; error: string | null; created_at: string }
export interface PluginList { plugins: PluginRow[]; installations: Installation[]; accounts: Account[]; jobs: Job[]; env: { linkedinOAuth: boolean } }

export default function Plugins() {
  const { space } = useTheme();
  const list = useAsync(() => api.plugins<PluginList>({ action: 'list' }));
  const reload = list.reload;
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const d = list.data;
  return (
    <>
      <TopBar onBack={() => router.back()} title="Plugins" />
      <Screen>
        <ScreenTitle title="Imports and plugins" caption="Every import is labeled with its source and stays private to you. Connectors run on the server, never inside the app." />
        {list.loading && !d ? <Loading /> : null}
        {list.error ? <Notice>{list.error}</Notice> : null}
        <T variant="title">Built in</T>
        <Card><T variant="name">CSV file</T><T variant="body" color="inkSoft">Any spreadsheet with names. Map columns, review duplicates, then import.</T><Button size="sm" title="Import a CSV" onPress={() => router.push('/import/csv')} style={{ alignSelf: 'flex-start' }} /></Card>
        <Card><T variant="name">Phone contacts</T><T variant="body" color="inkSoft">Pick people one by one. iOS and Android only.</T><Button size="sm" title="Choose contacts" onPress={() => router.push('/import/phone')} style={{ alignSelf: 'flex-start' }} /></Card>
        {d?.plugins.length ? <T variant="title" style={{ marginTop: space[2] }}>Connectors</T> : null}
        {d?.plugins.map((p) => {
          const inst = d.installations.find((x) => x.plugin_id === p.id);
          const acct = d.accounts.find((x) => x.plugin_id === p.id && x.status !== 'disconnected');
          return (
            <Card key={p.id}>
              <Row between><T variant="name">{p.name}</T><Flag label={p.kind === 'builtin' ? 'Built in' : `Community · ${p.author}`} /></Row>
              <T variant="body" color="inkSoft">{p.description}</T>
              <Row wrap>{p.capabilities.map((c) => <Flag key={c} label={c} />)}{p.status !== 'active' ? <Flag label={p.status} tone="caution" /> : null}</Row>
              {acct ? <T variant="caption" color={acct.status === 'error' ? 'cautionInk' : 'inkSoft'}>{acct.status === 'error' ? `Last run failed: ${acct.last_error}` : acct.last_sync_at ? `Last import ${new Date(acct.last_sync_at).toLocaleString()}` : 'Connected, nothing imported yet'}</T> : null}
              <Row>
                <Button size="sm" variant={inst?.enabled ? 'secondary' : 'primary'} title={inst?.enabled ? 'Open' : 'Install'} onPress={async () => { if (!inst?.enabled) await api.plugins({ action: 'install', pluginId: p.id }); router.push({ pathname: '/plugins/[id]', params: { id: p.id } }); }} />
                {inst ? <Button variant="ghost" size="sm" title="Remove" onPress={async () => { await api.plugins({ action: 'uninstall', pluginId: p.id }); reload(); }} /> : null}
              </Row>
            </Card>
          );
        })}
        {d?.jobs.length ? (
          <View style={{ gap: space[1], marginTop: space[2] }}>
            <T variant="title">Recent runs</T>
            {d.jobs.slice(0, 8).map((j) => <T key={j.id} variant="caption" color={j.status === 'failed' ? 'cautionInk' : 'inkSoft'}>{new Date(j.created_at).toLocaleString()} · {j.plugin_id} · {j.kind} · {j.status}{j.stats ? ` · ${Object.entries(j.stats).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}{j.error ? ` · ${j.error}` : ''}</T>)}
          </View>
        ) : null}
        <T variant="caption" color="inkSoft" style={{ marginTop: space[2] }}>Want to add a connector? See plugins/template in the repository: a manifest, a small HTTPS JSON service, and a fixture test. Bridge validates every record and never runs plugin code on your phone.</T>
      </Screen>
    </>
  );
}
