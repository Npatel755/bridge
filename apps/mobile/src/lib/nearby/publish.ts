import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export interface Sample { lat: number; lng: number; accuracyM: number; sampledAt: Date }
export type PublishStatus = 'ok' | 'disabled' | 'no_session' | 'stale_sample' | 'low_accuracy' | 'rate_limited' | 'simulation_not_allowed' | 'session_is_simulated' | 'error';
export interface PublishResult { status: PublishStatus; matches: string[]; note?: string; error?: string }

export interface MatchPayload {
  event_id: string;
  other_id: string;
  band: 'very_close' | 'close' | 'nearby';
  shared_skills: string[];
  shared_interests: string[];
  relevance: number;
  is_existing_contact: boolean;
  simulated: boolean;
  status: string;
  created_at: string;
  profile: { display_name: string; avatar_url: string | null; role_title: string; company: string; school: string; city: string; bio: string; is_demo: boolean; tags: { kind: string; tag: string; label: string }[] };
}

/** Send one location sample to the server. The server decides matching; the client never sees other users' coordinates. */
export async function publishSample(s: Sample, simulated: boolean): Promise<PublishResult> {
  const { data, error } = await supabase.rpc('nearby_publish', { lat: s.lat, lng: s.lng, accuracy_m: s.accuracyM, sampled_at: s.sampledAt.toISOString(), p_simulated: simulated });
  if (error) return { status: 'error', matches: [], error: error.message };
  const r = data as { status: PublishStatus; matches?: string[]; note?: string };
  const matches = r.matches ?? [];
  if (matches.length) await notifyMatches(matches);
  return { status: r.status, matches, note: r.note };
}

export async function loadMatch(eventId: string): Promise<MatchPayload | null> {
  const { data } = await supabase.rpc('match_payload', { event_id: eventId });
  return (data as MatchPayload | null) ?? null;
}

async function notifyMatches(eventIds: string[]) {
  const { data: prefs } = await supabase.from('discovery_prefs').select('haptics, visual_only').maybeSingle();
  if (Platform.OS !== 'web' && prefs?.haptics !== false) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Haptics = require('expo-haptics') as typeof import('expo-haptics');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { /* haptics unavailable */ }
  }
  if (Platform.OS === 'web' || prefs?.visual_only) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    for (const id of eventIds) {
      const m = await loadMatch(id);
      if (!m) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: `${m.profile.display_name} is nearby`, body: `Shared: ${[...m.shared_skills, ...m.shared_interests].slice(0, 3).join(', ')}${m.simulated ? ' (simulated)' : ''}`, data: { eventId: id } },
        trigger: null,
      });
      await supabase.from('match_events').update({ notified_at: new Date().toISOString() }).eq('id', id);
    }
  } catch { /* notifications unavailable (e.g. Expo Go on Android) */ }
}
