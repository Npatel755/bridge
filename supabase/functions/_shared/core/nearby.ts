/** Pure nearby-discovery rules. The Postgres function `nearby_publish` mirrors these; tests cover both. */

export const NEARBY_DEFAULTS = {
  maxSampleAgeSec: 120,
  maxAccuracyM: 50,
  radiusM: 100,
  radiusOptions: [50, 100, 250] as const,
  presenceTtlSec: 300,
  stableSamples: 2,
  perPersonCooldownSec: 3600,
  burstWindowSec: 600,
  burstMax: 3,
  minSharedSkills: 1,
  minSharedInterests: 1,
};

export type AudiencePreference = 'everyone' | 'existing_connections' | 'new_people';

export interface NearbyParticipant {
  userId: string;
  enabled: boolean;
  /** null = until manually stopped. */
  sessionExpiresAt: string | null;
  radiusM: number;
  audience: AudiencePreference;
  minRelevance: number;
  skills: string[];
  interests: string[];
  blocked: string[];
  sample: { lat: number; lng: number; accuracyM: number; recordedAt: string } | null;
}

export type IneligibleReason =
  | 'disabled'
  | 'session_expired'
  | 'no_location'
  | 'stale_location'
  | 'low_accuracy'
  | 'out_of_range'
  | 'blocked'
  | 'no_skill_overlap'
  | 'no_interest_overlap'
  | 'below_threshold'
  | 'audience';

export interface EligibilityResult {
  eligible: boolean;
  reasons: IneligibleReason[];
  distanceM: number | null;
  radiusM: number;
  sharedSkills: string[];
  sharedInterests: string[];
  relevance: number;
  band: DistanceBand | null;
}

export type DistanceBand = 'within ~50 m' | 'within ~100 m' | 'within ~250 m';

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Coarse band only; never expose raw distance or coordinates to the other user. */
export function distanceBand(distanceM: number): DistanceBand {
  if (distanceM <= 50) return 'within ~50 m';
  if (distanceM <= 100) return 'within ~100 m';
  return 'within ~250 m';
}

/** Accuracy is adequate if each fix is <= max and combined uncertainty fits inside the radius. */
export function accuracyAdequate(accA: number, accB: number, radiusM: number, maxAccuracyM = NEARBY_DEFAULTS.maxAccuracyM): boolean {
  return accA <= maxAccuracyM && accB <= maxAccuracyM && accA + accB <= radiusM;
}

export function intersect(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return [...new Set(a.filter((x) => set.has(x)))];
}

export function evaluatePair(
  a: NearbyParticipant,
  b: NearbyParticipant,
  ctx: { now: Date; areConnected?: boolean; cfg?: Partial<typeof NEARBY_DEFAULTS> },
): EligibilityResult {
  const cfg = { ...NEARBY_DEFAULTS, ...ctx.cfg };
  const reasons: IneligibleReason[] = [];
  const radiusM = Math.min(a.radiusM, b.radiusM);
  const sharedSkills = intersect(a.skills, b.skills);
  const sharedInterests = intersect(a.interests, b.interests);
  const relevance = sharedSkills.length + sharedInterests.length;

  for (const p of [a, b]) {
    if (!p.enabled) reasons.push('disabled');
    else if (p.sessionExpiresAt && Date.parse(p.sessionExpiresAt) <= ctx.now.getTime()) reasons.push('session_expired');
    if (!p.sample) reasons.push('no_location');
    else if ((ctx.now.getTime() - Date.parse(p.sample.recordedAt)) / 1000 > cfg.maxSampleAgeSec) reasons.push('stale_location');
  }
  if (a.blocked.includes(b.userId) || b.blocked.includes(a.userId)) reasons.push('blocked');
  if (sharedSkills.length < cfg.minSharedSkills) reasons.push('no_skill_overlap');
  if (sharedInterests.length < cfg.minSharedInterests) reasons.push('no_interest_overlap');
  if (relevance < Math.max(a.minRelevance, b.minRelevance)) reasons.push('below_threshold');
  for (const p of [a, b]) {
    if (p.audience === 'existing_connections' && !ctx.areConnected) reasons.push('audience');
    if (p.audience === 'new_people' && ctx.areConnected) reasons.push('audience');
  }

  let distanceM: number | null = null;
  if (a.sample && b.sample) {
    distanceM = haversineM(a.sample, b.sample);
    if (!accuracyAdequate(a.sample.accuracyM, b.sample.accuracyM, radiusM, cfg.maxAccuracyM)) reasons.push('low_accuracy');
    else if (distanceM > radiusM) reasons.push('out_of_range');
  }
  const unique = [...new Set(reasons)];
  return {
    eligible: unique.length === 0,
    reasons: unique,
    distanceM,
    radiusM,
    sharedSkills,
    sharedInterests,
    relevance,
    band: distanceM !== null && unique.length === 0 ? distanceBand(distanceM) : null,
  };
}

/** Requires the last N evaluations for a pair to all be eligible (GPS jitter guard). */
export function isStable(history: boolean[], required = NEARBY_DEFAULTS.stableSamples): boolean {
  if (history.length < required) return false;
  return history.slice(-required).every(Boolean);
}

export interface AlertState {
  /** matchEventId values already alerted (foreground or background). */
  seen: string[];
  /** Recent alerts: person id + epoch ms. */
  recent: { personId: string; at: number }[];
}

export interface AlertSettings {
  hapticsEnabled: boolean;
  quietHours: { start: string; end: string } | null;
  perPersonCooldownSec: number;
  burstWindowSec: number;
  burstMax: number;
  muted: string[];
}

export type AlertDecision =
  | { deliver: true; haptic: boolean; state: AlertState }
  | { deliver: false; reason: 'duplicate' | 'cooldown' | 'burst_limit' | 'muted'; state: AlertState };

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h % 24) * 60 + (m || 0);
}

export function inQuietHours(now: Date, quiet: AlertSettings['quietHours']): boolean {
  if (!quiet) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = minutesOf(quiet.start);
  const e = minutesOf(quiet.end);
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

/** Debounce/dedupe for alerts across foreground and background delivery. */
export function decideAlert(
  event: { id: string; personId: string },
  state: AlertState,
  settings: AlertSettings,
  now: Date,
): AlertDecision {
  const t = now.getTime();
  const pruned: AlertState = {
    seen: state.seen.slice(-200),
    recent: state.recent.filter((r) => t - r.at < Math.max(settings.perPersonCooldownSec, settings.burstWindowSec) * 1000),
  };
  if (pruned.seen.includes(event.id)) return { deliver: false, reason: 'duplicate', state: pruned };
  if (settings.muted.includes(event.personId)) return { deliver: false, reason: 'muted', state: { ...pruned, seen: [...pruned.seen, event.id] } };
  if (pruned.recent.some((r) => r.personId === event.personId && t - r.at < settings.perPersonCooldownSec * 1000))
    return { deliver: false, reason: 'cooldown', state: { ...pruned, seen: [...pruned.seen, event.id] } };
  if (pruned.recent.filter((r) => t - r.at < settings.burstWindowSec * 1000).length >= settings.burstMax)
    return { deliver: false, reason: 'burst_limit', state: pruned };
  return {
    deliver: true,
    haptic: settings.hapticsEnabled && !inQuietHours(now, settings.quietHours),
    state: { seen: [...pruned.seen, event.id], recent: [...pruned.recent, { personId: event.personId, at: t }] },
  };
}

export function conversationStarter(sharedSkills: string[], sharedInterests: string[], label: (t: string) => string): string {
  const s = sharedSkills[0] ? label(sharedSkills[0]).toLowerCase() : null;
  const i = sharedInterests[0] ? label(sharedInterests[0]).toLowerCase() : null;
  if (s && i) return `You both work on ${s} and care about ${i}. Ask what they're building in ${i} right now.`;
  if (s) return `You both work on ${s}. Ask what problem they're tackling lately.`;
  if (i) return `You're both into ${i}. Ask how they got started.`;
  return 'Say hi and ask what brought them here.';
}

export function alertCopy(sharedSkills: string[], sharedInterests: string[], label: (t: string) => string): string {
  const s = sharedSkills.slice(0, 2).map((t) => label(t).toLowerCase()).join(' and ');
  const i = sharedInterests.slice(0, 2).map((t) => label(t).toLowerCase()).join(' and ');
  return `Someone nearby also works on ${s} and is interested in ${i}.`;
}
