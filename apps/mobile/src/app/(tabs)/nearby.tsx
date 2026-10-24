import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { Button, Card, Flag, Loading, NearbyMatchCard, NearbyRings, NearbyStatusRow, Notice, Row, Screen, ScreenTitle, Segmented, Sheet, T, Toggle } from '@/components';
import { useTheme } from '@/constants/theme';
import { useAsync } from '@/hooks/use-async';
import { errorMessage } from '@/lib/api';
import { getCapability, getStatus, loadMatch, requestBackground, requestForeground, runSimulation, startCollecting, startSession, stopCollecting, stopSession, type Capability, type MatchPayload, type NearbyStatus, type PublishResult } from '@/lib/nearby';
import { setNearbyOn } from '@/lib/nearby/state';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const RADII = [{ key: '50', label: '~50 m' }, { key: '100', label: '~100 m' }, { key: '250', label: '~250 m' }] as const;
const AUDIENCE = [{ key: 'both', label: 'Anyone' }, { key: 'existing', label: 'My cards' }, { key: 'new', label: 'New people' }] as const;
const DEMO_POINT = { lat: 33.7756, lng: -84.3963 }; // fictional campus square used by the simulator

export default function Nearby() {
  const { space } = useTheme();
  const { profile, session } = useSession();
  const [cap, setCap] = useState<Capability>('undetermined');
  const [last, setLast] = useState<PublishResult | null>(null);
  const [simMsg, setSimMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'block' | 'report'; m: MatchPayload } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const status = useAsync<NearbyStatus>(getStatus);
  const matches = useAsync(async () => {
    const { data } = await supabase.from('match_events').select('id').in('status', ['new', 'seen']).order('created_at', { ascending: false }).limit(10);
    const list = await Promise.all((data ?? []).map((e) => loadMatch(e.id)));
    return list.filter((m): m is MatchPayload => !!m);
  });
  const intros = useAsync(async () => {
    const me = session?.user.id;
    const { data } = await supabase.from('intro_requests').select('id, from_id, message, status, created_at').eq('to_id', me).eq('status', 'pending');
    return data ?? [];
  });
  const reloadStatus = status.reload, reloadMatches = matches.reload, reloadIntros = intros.reload;
  const refreshAll = useCallback(() => { reloadStatus(); reloadMatches(); reloadIntros(); getCapability().then(setCap); }, [reloadStatus, reloadMatches, reloadIntros]);
  useFocusEffect(useCallback(() => { refreshAll(); }, [refreshAll]));
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);

  const prefs = status.data?.prefs;
  const sess = status.data?.session;
  const active = !!sess && new Date(sess.expires_at).getTime() > now;
  useEffect(() => { setNearbyOn(active); if (!active) stopCollecting(); }, [active]);
  useEffect(() => { if (sess && !active) stopSession('expired').then(refreshAll).catch(() => {}); }, [sess, active, refreshAll]);

  async function savePrefs(patch: Record<string, unknown>) {
    const { error } = await supabase.from('discovery_prefs').update(patch).eq('owner_id', session?.user.id);
    if (error) setError(error.message); else status.reload();
  }
  async function begin(mode: 'foreground' | 'background') {
    setBusy(mode); setError(null);
    try {
      if (!prefs?.enabled) await savePrefs({ enabled: true });
      const c = mode === 'background' ? await requestBackground() : await requestForeground();
      setCap(c);
      if (c === 'denied' || c === 'unsupported') { setError(c === 'denied' ? 'Location permission is off. Nearby cannot run without it.' : 'This device cannot share location.'); return; }
      const effective = mode === 'background' && c !== 'background_capable' ? 'foreground' : mode;
      await startSession(effective);
      await startCollecting(effective, (r) => { setLast(r); if (r.matches.length) matches.reload(); });
      refreshAll();
    } catch (e) { setError(friendly(errorMessage(e))); } finally { setBusy(null); }
  }
  async function end() {
    setBusy('stop');
    try { await stopSession(); setLast(null); refreshAll(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }
  async function simulate() {
    setBusy('sim'); setError(null); setSimMsg(null);
    try {
      if (!prefs?.enabled) await savePrefs({ enabled: true });
      if (sess && sess.mode !== 'simulated') await stopSession('switch_to_demo');
      if (!sess || sess.mode !== 'simulated') await startSession('simulated');
      const r = await runSimulation(DEMO_POINT.lat, DEMO_POINT.lng, setSimMsg);
      setLast(r);
      setSimMsg(r.status === 'ok' ? (r.matches.length ? `${r.matches.length} simulated match${r.matches.length > 1 ? 'es' : ''} found. Others were excluded by the rules below.` : 'Second sample accepted. No new matches: the personas you can match are on cooldown or already shown.') : `Sample rejected: ${r.status.replace(/_/g, ' ')}.`);
      refreshAll();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }
  async function act(m: MatchPayload, action: 'dismiss' | 'mute' | 'block' | 'report' | 'intro') {
    setError(null);
    try {
      const me = session?.user.id;
      if (action === 'intro') { const { error } = await supabase.from('intro_requests').insert({ from_id: me, to_id: m.other_id, match_event_id: m.event_id, message: `Hi ${m.profile.display_name.split(' ')[0]}, we overlap on ${[...m.shared_skills, ...m.shared_interests].slice(0, 2).join(' and ')}. Happy to say hello if you are up for it.` }); if (error) throw error; }
      if (action === 'mute') { const { error } = await supabase.from('mutes').upsert({ owner_id: me, other_id: m.other_id, until: new Date(now + 86_400_000).toISOString() }); if (error) throw error; }
      if (action === 'block') { const { error } = await supabase.from('blocks').insert({ blocker_id: me, blocked_id: m.other_id }); if (error) throw error; }
      if (action === 'report') { const { error } = await supabase.from('reports').insert({ reporter_id: me, reported_id: m.other_id, match_event_id: m.event_id, reason: 'inappropriate', details: 'Reported from a Nearby match card' }); if (error) throw error; }
      const statusFor = { dismiss: 'dismissed', mute: 'muted', block: 'blocked', report: 'reported', intro: 'intro_requested' } as const;
      await supabase.from('match_events').update({ status: statusFor[action] }).eq('id', m.event_id);
      matches.reload();
    } catch (e) { setError(errorMessage(e)); }
  }

  const minsLeft = sess ? Math.max(0, Math.round((new Date(sess.expires_at).getTime() - now) / 60_000)) : 0;
  const rowState: 'on' | 'paused' | 'off' = cap === 'denied' || cap === 'unsupported' ? 'off' : active ? 'on' : 'paused';
  const rowTitle = rowState === 'on' ? (sess?.mode === 'simulated' ? 'Nearby is on, simulated for demo' : 'Nearby is on') : rowState === 'paused' ? 'Nearby is paused' : 'Location permission is off';
  const rowDetail = rowState === 'on' ? `${minsLeft} min left, ${prefs?.radius_m ?? 100} m, ${sess?.mode === 'background' ? 'works in background' : sess?.mode === 'simulated' ? 'simulated samples only' : 'foreground only'}` : rowState === 'paused' ? "You're hidden and alerts are off." : cap === 'unsupported' ? 'This device cannot share location.' : 'Bridge needs location while in use to notice people nearby.';
  const live = matches.data ?? [];
  const radius = (prefs?.radius_m ?? 100) as 50 | 100 | 250;

  return (
    <Screen>
      <ScreenTitle title="Nearby" caption="Notices people within a coarse distance who share a skill and an interest with you. Both of you must have it on." />
      {status.loading && !status.data ? <Loading /> : (
        <NearbyStatusRow state={rowState} title={rowTitle} detail={rowDetail} enabled={active} onToggle={(v) => (v ? begin(cap === 'background_capable' ? 'background' : 'foreground') : end())} onSettings={() => (Platform.OS === 'web' ? requestForeground().then(setCap) : Linking.openSettings())} />
      )}
      {error ? <Notice>{error}</Notice> : null}
      {last && last.status !== 'ok' && last.status !== 'rate_limited' ? <Notice>{explain(last.status)}</Notice> : null}
      <NearbyRings matchBands={live.map((m) => m.band)} radiusM={radius} />

      {live.map((m, i) => {
        return (
          <NearbyMatchCard key={m.event_id} match={m} announce={i === 0} starter={starterFor(m)}
            onRequestIntro={() => act(m, 'intro')} onDismiss={() => act(m, 'dismiss')} onMute={() => act(m, 'mute')} onBlock={() => setConfirm({ kind: 'block', m })} onReport={() => setConfirm({ kind: 'report', m })} />
        );
      })}
      {active && live.length === 0 ? <Card dashed><T variant="body">No one matching yet. Matches need two steady readings from both phones, a shared skill and interest, and no block or mute in the way.</T></Card> : null}

      {intros.data?.length ? (
        <View style={{ gap: space[2] }}>
          <T variant="title">Intro requests for you</T>
          {intros.data.map((r) => (
            <Card key={r.id}>
              <T variant="note">“{r.message}”</T>
              <Row>
                <Button variant="primary" size="sm" title="Accept" onPress={async () => { await supabase.from('intro_requests').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', r.id); intros.reload(); }} />
                <Button size="sm" title="Decline" onPress={async () => { await supabase.from('intro_requests').update({ status: 'declined', responded_at: new Date().toISOString() }).eq('id', r.id); intros.reload(); }} />
              </Row>
            </Card>
          ))}
        </View>
      ) : null}

      <T variant="title" style={{ marginTop: space[3] }}>Settings</T>
      <Card>
        <T variant="label" color="inkSoft">Radius</T>
        <Segmented options={[...RADII]} value={String(radius) as (typeof RADII)[number]['key']} onChange={(k) => savePrefs({ radius_m: Number(k) })} />
        <T variant="caption" color="inkSoft">When two people pick different radii, the smaller one wins.</T>
        <T variant="label" color="inkSoft" style={{ marginTop: space[2] }}>Who can match you</T>
        <Segmented options={[...AUDIENCE]} value={(prefs?.audience ?? 'both') as (typeof AUDIENCE)[number]['key']} onChange={(k) => savePrefs({ audience: k })} />
        <Row between style={{ marginTop: space[2] }}><T variant="body">Haptic alert</T><Toggle label="Haptic alert" value={prefs?.haptics ?? true} onValueChange={(v) => savePrefs({ haptics: v })} /></Row>
        <Row between><T variant="body">Visual alerts only (no notifications)</T><Toggle label="Visual only" value={prefs?.visual_only ?? false} onValueChange={(v) => savePrefs({ visual_only: v })} /></Row>
        <T variant="caption" color="inkSoft">Sessions last {prefs?.session_minutes ?? 60} minutes. One alert per person per hour, at most {prefs?.burst_max ?? 3} alerts in {Math.round((prefs?.burst_window_sec ?? 600) / 60)} minutes. {status.data?.discoverable_skills ?? 0} skills and {status.data?.discoverable_interests ?? 0} interests on your card are discoverable.</T>
      </Card>
      {!active ? (
        <Row wrap>
          <Button variant="primary" title="Turn on while using the app" loading={busy === 'foreground'} onPress={() => begin('foreground')} disabled={cap === 'unsupported'} />
          {Platform.OS !== 'web' ? <Button title="Allow in background" loading={busy === 'background'} onPress={() => begin('background')} /> : null}
        </Row>
      ) : <Button title="Turn off and remove my presence" loading={busy === 'stop'} onPress={end} />}
      <T variant="caption" color="inkSoft">{capabilityCopy(cap)}</T>

      <Card style={{ marginTop: space[3] }}>
        <Flag label="Demo simulator, not real location" tone="nearby" />
        <T variant="body">Places fictional personas around a fixed point and sends two simulated readings. It shows a valid match and how the rules exclude others: blocked, no shared interest, Nearby off, out of range, poor accuracy, smaller radius.</T>
        {simMsg ? <Notice tone="plain">{simMsg}</Notice> : null}
        <Button title="Run the simulation" loading={busy === 'sim'} onPress={simulate} disabled={!profile} />
        <Button variant="ghost" size="sm" title="Why each persona was included or excluded" onPress={() => router.push('/settings?section=personas')} />
      </Card>

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === 'block' ? `Block ${confirm.m.profile.display_name}?` : `Report ${confirm?.m.profile.display_name}?`}>
        <T variant="body" color="inkSoft">{confirm?.kind === 'block' ? 'They will no longer match or message you, and pending intro requests are declined. You can undo this in Settings.' : 'Sends this match to the Bridge team for review and hides it from you.'}</T>
        <Button variant="danger" title={confirm?.kind === 'block' ? 'Block' : 'Report'} onPress={() => { if (confirm) act(confirm.m, confirm.kind); setConfirm(null); }} />
      </Sheet>
    </Screen>
  );
}

function starterFor(m: MatchPayload) {
  const topic = m.shared_skills[0] ?? m.shared_interests[0];
  return topic ? `Ask what ${m.profile.display_name.split(' ')[0]} is building with ${topic.replace(/-/g, ' ')}.` : undefined;
}
function explain(s: PublishResult['status']) {
  switch (s) {
    case 'low_accuracy': return 'Your location reading is too rough (over 50 m). Step outside or wait for a better fix. Nothing was shared.';
    case 'stale_sample': return 'That reading was over two minutes old, so it was not shared.';
    case 'disabled': return 'Nearby is off in your settings.';
    case 'no_session': return 'Nearby is not running. Turn it on to share your presence.';
    case 'simulation_not_allowed': return 'Simulated readings are only accepted in a demo session.';
    case 'session_is_simulated': return 'A demo session is running. Turn it off before using real location.';
    default: return 'Could not reach the server. Your presence was not updated.';
  }
}
function capabilityCopy(c: Capability) {
  switch (c) {
    case 'background_capable': return 'Background location is allowed. Nearby can keep running when the app is closed, for the session length.';
    case 'foreground_only': return Platform.OS === 'web' ? 'In a browser, Nearby works only while this tab is open.' : 'Allowed while using the app. Choose “Allow in background” for alerts when the app is closed.';
    case 'denied': return 'Location permission is denied. Change it in system Settings to use Nearby.';
    case 'unsupported': return 'This device cannot provide location.';
    default: return 'Bridge asks for location only when you turn Nearby on. Exact coordinates stay on the server and are deleted when you turn it off.';
  }
}
function friendly(msg: string) { return /denied/i.test(msg) ? 'Location permission was denied.' : msg; }
