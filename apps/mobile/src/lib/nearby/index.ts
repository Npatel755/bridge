import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { NEARBY_TASK } from '@/lib/nearby/task';
import { publishSample, type PublishResult, type Sample } from '@/lib/nearby/publish';
import { supabase } from '@/lib/supabase';

export type Capability = 'unsupported' | 'denied' | 'undetermined' | 'foreground_only' | 'background_capable';

export async function getCapability(): Promise<Capability> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unsupported';
    const fg = await Location.getForegroundPermissionsAsync();
    return fg.status === 'denied' ? 'denied' : fg.granted ? 'foreground_only' : 'undetermined';
  }
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status === 'denied' && !fg.canAskAgain) return 'denied';
  if (!fg.granted) return 'undetermined';
  const bg = await Location.getBackgroundPermissionsAsync();
  const available = await Location.isBackgroundLocationAvailableAsync().catch(() => false);
  return bg.granted && available ? 'background_capable' : 'foreground_only';
}

export async function requestForeground(): Promise<Capability> {
  const r = await Location.requestForegroundPermissionsAsync();
  if (!r.granted) return 'denied';
  return getCapability();
}

export async function requestBackground(): Promise<Capability> {
  if (Platform.OS === 'web') return 'foreground_only';
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) await Location.requestForegroundPermissionsAsync();
  await Location.requestBackgroundPermissionsAsync();
  return getCapability();
}

let fgSub: Location.LocationSubscription | null = null;

const toSample = (l: Location.LocationObject): Sample => ({ lat: l.coords.latitude, lng: l.coords.longitude, accuracyM: l.coords.accuracy ?? 999, sampledAt: new Date(l.timestamp) });

export async function startCollecting(mode: 'foreground' | 'background', onResult: (r: PublishResult, s: Sample) => void) {
  await stopCollecting();
  if (mode === 'background' && Platform.OS !== 'web') {
    await Location.startLocationUpdatesAsync(NEARBY_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 20_000,
      distanceInterval: 10,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: { notificationTitle: 'Bridge Nearby is on', notificationBody: 'Looking for people with shared skills and interests nearby.', killServiceOnDestroy: true },
    });
  }
  fgSub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 6_000, distanceInterval: 3 }, async (loc) => {
    const s = toSample(loc);
    onResult(await publishSample(s, false), s);
  });
}

export async function stopCollecting() {
  fgSub?.remove();
  fgSub = null;
  if (Platform.OS !== 'web') {
    const started = await Location.hasStartedLocationUpdatesAsync(NEARBY_TASK).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(NEARBY_TASK);
  }
}

export interface NearbyStatus {
  prefs: { enabled: boolean; radius_m: 50 | 100 | 250; audience: 'both' | 'existing' | 'new'; haptics: boolean; visual_only: boolean; session_minutes: number; per_person_cooldown_sec: number; burst_max: number; burst_window_sec: number } | null;
  session: { id: string; mode: 'foreground' | 'background' | 'simulated'; started_at: string; expires_at: string } | null;
  presence: { expires_at: string; sampled_at: string; accuracy_m: number; simulated: boolean; publish_count: number } | null;
  discoverable_skills: number;
  discoverable_interests: number;
}

export async function getStatus(): Promise<NearbyStatus> {
  const { data, error } = await supabase.rpc('nearby_status');
  if (error) throw error;
  return data as NearbyStatus;
}

export async function startSession(mode: 'foreground' | 'background' | 'simulated') {
  const { error } = await supabase.rpc('nearby_start', { mode });
  if (error) throw error;
}

export async function stopSession(reason = 'user') {
  await stopCollecting();
  const { error } = await supabase.rpc('nearby_stop', { reason });
  if (error) throw error;
}

/** Labeled demo: places fictional personas around a point and publishes two simulated samples 5s apart. */
export async function runSimulation(lat: number, lng: number, onProgress: (msg: string) => void): Promise<PublishResult> {
  onProgress('Placing demo personas around you…');
  const { error } = await supabase.rpc('demo_place_personas', { lat, lng });
  if (error) throw error;
  onProgress('Publishing simulated sample 1 of 2…');
  const first = await publishSample({ lat, lng, accuracyM: 8, sampledAt: new Date() }, true);
  if (first.status !== 'ok') return first;
  onProgress('Waiting for a second stable sample (anti-flicker rule)…');
  await new Promise((r) => setTimeout(r, 5500));
  onProgress('Publishing simulated sample 2 of 2…');
  return publishSample({ lat: lat + 0.00002, lng, accuracyM: 9, sampledAt: new Date() }, true);
}

export { publishSample, loadMatch, type PublishResult, type Sample, type MatchPayload } from '@/lib/nearby/publish';
