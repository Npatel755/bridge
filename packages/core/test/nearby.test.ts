import { describe, expect, it } from 'vitest';
import { accuracyAdequate, alertCopy, decideAlert, distanceBand, evaluatePair, haversineM, inQuietHours, isStable, tagLabel, type AlertSettings, type NearbyParticipant } from '../src/index.ts';

const NOW = new Date('2026-10-01T12:00:00Z');
const BASE = { lat: 37.7749, lng: -122.4194 };
const offset = (m: number) => ({ lat: BASE.lat + m / 111_320, lng: BASE.lng });

function person(id: string, partial: Partial<NearbyParticipant> = {}, metersAway = 0): NearbyParticipant {
  return {
    userId: id,
    enabled: true,
    sessionExpiresAt: '2026-10-01T13:00:00Z',
    radiusM: 100,
    audience: 'everyone',
    minRelevance: 2,
    skills: ['embedded-systems', 'firmware'],
    interests: ['cycling'],
    blocked: [],
    sample: { ...offset(metersAway), accuracyM: 10, recordedAt: '2026-10-01T11:59:30Z' },
    ...partial,
  };
}

describe('nearby eligibility', () => {
  it('matches when skills AND interests overlap within the smaller radius', () => {
    const r = evaluatePair(person('a'), person('b', { radiusM: 250 }, 60), { now: NOW });
    expect(r.eligible).toBe(true);
    expect(r.radiusM).toBe(100);
    expect(r.sharedSkills).toEqual(['embedded-systems', 'firmware']);
    expect(r.band).toBe('within ~100 m');
  });
  it('requires interest overlap, not just skills', () => {
    expect(evaluatePair(person('a'), person('b', { interests: ['music'] }, 10), { now: NOW }).reasons).toContain('no_interest_overlap');
  });
  it('uses the smaller radius', () => {
    expect(evaluatePair(person('a', { radiusM: 50 }), person('b', {}, 80), { now: NOW }).reasons).toContain('out_of_range');
  });
  it('rejects stale samples and low accuracy', () => {
    expect(evaluatePair(person('a'), person('b', { sample: { ...BASE, accuracyM: 10, recordedAt: '2026-10-01T11:57:00Z' } }), { now: NOW }).reasons).toContain('stale_location');
    expect(evaluatePair(person('a'), person('b', { sample: { ...BASE, accuracyM: 80, recordedAt: NOW.toISOString() } }), { now: NOW }).reasons).toContain('low_accuracy');
    expect(accuracyAdequate(30, 30, 50)).toBe(false);
    expect(accuracyAdequate(20, 20, 50)).toBe(true);
  });
  it('suppresses disabled, expired, and blocked users in both directions', () => {
    expect(evaluatePair(person('a', { enabled: false }), person('b'), { now: NOW }).reasons).toContain('disabled');
    expect(evaluatePair(person('a', { sessionExpiresAt: '2026-10-01T11:00:00Z' }), person('b'), { now: NOW }).reasons).toContain('session_expired');
    expect(evaluatePair(person('a', { sessionExpiresAt: null }), person('b'), { now: NOW }).eligible).toBe(true);
    expect(evaluatePair(person('a'), person('b', { blocked: ['a'] }), { now: NOW }).reasons).toContain('blocked');
    expect(evaluatePair(person('a', { blocked: ['b'] }), person('b'), { now: NOW }).reasons).toContain('blocked');
  });
  it('respects audience preferences', () => {
    expect(evaluatePair(person('a', { audience: 'existing_connections' }), person('b'), { now: NOW, areConnected: false }).reasons).toContain('audience');
    expect(evaluatePair(person('a', { audience: 'new_people' }), person('b'), { now: NOW, areConnected: true }).reasons).toContain('audience');
  });
  it('needs two stable samples', () => {
    expect(isStable([true])).toBe(false);
    expect(isStable([false, true, true])).toBe(true);
    expect(isStable([true, false])).toBe(false);
  });
  it('uses coarse bands only', () => {
    expect(distanceBand(12)).toBe('within ~50 m');
    expect(distanceBand(230)).toBe('within ~250 m');
    expect(Math.round(haversineM(BASE, offset(100)))).toBe(100);
  });
  it('writes alert copy from shared topics', () => {
    expect(alertCopy(['embedded-systems'], ['cycling'], tagLabel)).toBe('Someone nearby also works on embedded systems and is interested in cycling.');
  });
});

describe('alert limiter', () => {
  const settings: AlertSettings = { hapticsEnabled: true, quietHours: null, perPersonCooldownSec: 3600, burstWindowSec: 600, burstMax: 3, muted: [] };
  it('dedupes the same event across foreground and background', () => {
    const a = decideAlert({ id: 'e1', personId: 'p1' }, { seen: [], recent: [] }, settings, NOW);
    expect(a.deliver).toBe(true);
    const b = decideAlert({ id: 'e1', personId: 'p1' }, a.state, settings, NOW);
    expect(b).toMatchObject({ deliver: false, reason: 'duplicate' });
  });
  it('enforces one alert per person per hour and three per ten minutes', () => {
    let state = { seen: [] as string[], recent: [] as { personId: string; at: number }[] };
    const d1 = decideAlert({ id: 'e1', personId: 'p1' }, state, settings, NOW);
    state = d1.state;
    expect(decideAlert({ id: 'e2', personId: 'p1' }, state, settings, new Date(NOW.getTime() + 30 * 60_000))).toMatchObject({ deliver: false, reason: 'cooldown' });
    for (const p of ['p2', 'p3']) state = decideAlert({ id: `x${p}`, personId: p }, state, settings, NOW).state;
    expect(decideAlert({ id: 'e4', personId: 'p4' }, state, settings, NOW)).toMatchObject({ deliver: false, reason: 'burst_limit' });
    expect(decideAlert({ id: 'e5', personId: 'p4' }, state, settings, new Date(NOW.getTime() + 11 * 60_000)).deliver).toBe(true);
    expect(decideAlert({ id: 'e6', personId: 'p1' }, state, settings, new Date(NOW.getTime() + 61 * 60_000)).deliver).toBe(true);
  });
  it('mutes and quiet hours', () => {
    expect(decideAlert({ id: 'm', personId: 'p9' }, { seen: [], recent: [] }, { ...settings, muted: ['p9'] }, NOW)).toMatchObject({ deliver: false, reason: 'muted' });
    const q = new Date(2026, 9, 1, 23, 30);
    expect(inQuietHours(q, { start: '22:00', end: '07:00' })).toBe(true);
    const d = decideAlert({ id: 'q', personId: 'p1' }, { seen: [], recent: [] }, { ...settings, quietHours: { start: '22:00', end: '07:00' } }, q);
    expect(d).toMatchObject({ deliver: true, haptic: false });
  });
});
