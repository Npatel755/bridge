import { describe, expect, it } from 'vitest';
import { cosine, draftOutreach, hashEmbedding, mailtoUrl, toRelationship } from '../src/index.ts';

describe('hash embedding fallback', () => {
  it('is deterministic and places synonyms closer than unrelated text', () => {
    const a = hashEmbedding('firmware and microcontrollers for bikes');
    expect(hashEmbedding('firmware and microcontrollers for bikes')).toEqual(a);
    const b = hashEmbedding('embedded systems engineer who loves cycling');
    const c = hashEmbedding('pastry chef specializing in croissants');
    expect(a).toHaveLength(256);
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });
});

describe('outreach drafts', () => {
  it('references relationship context and never claims to send', () => {
    const d = draftOutreach({ senderName: 'Nick Patel', recipientName: 'Maya Chen', howMet: 'at a hackathon', ask: 'Could I get 20 minutes of advice on firmware?', goal: 'a smart bike light' });
    expect(d.body).toMatch(/meeting you at a hackathon/);
    expect(d.body).toMatch(/smart bike light/);
    expect(mailtoUrl(d, 'maya@example.com')).toMatch(/^mailto:maya@example.com\?subject=/);
  });
  it('drafts an introduction request through the connector', () => {
    const d = draftOutreach({
      senderName: 'Nick', recipientName: 'Jordan Reyes', ask: 'Would you be open to introducing us?', goal: 'small-batch manufacturing', targetName: 'Priya Nair',
      route: { type: 'introduction', description: '', path: { hops: [], edges: [], confirmed: true } },
    });
    expect(d.kind).toBe('introduction_request');
    expect(d.subject).toMatch(/Priya/);
  });
});

describe('relationship vocabulary mapping', () => {
  it('maps the app vocabulary into core relationship types without warming followers', () => {
    for (const s of ['friend', 'classmate', 'mentor', 'mentee', 'family', 'acquaintance', 'client', 'collaborator', 'met_once']) expect(toRelationship(s)).toBe('personal');
    expect(toRelationship('former_colleague')).toBe('colleague');
    expect(toRelationship('colleague')).toBe('colleague');
    expect(toRelationship('mutual_connection')).toBe('mutual_connection');
    expect(toRelationship('follower')).toBe('follower');
    expect(toRelationship('following')).toBe('following');
    expect(toRelationship('garbage')).toBe('unknown');
  });
});

import { clamp01, evidenceQuality, isUncertain } from '../src/evidence.ts';
import { evaluatePair } from '../src/nearby.ts';
import { smsUrl } from '../src/outreach.ts';
import { CSV_LIMITS, detectDuplicates, parseCsv, type MappedContact } from '../src/csv.ts';
import type { Evidence } from '../src/types.ts';
import type { NearbyParticipant } from '../src/nearby.ts';

const ev = (over: Partial<Evidence>): Evidence => ({ id: 'e', contactId: 'c', sourceKind: 'self_reported', status: 'confirmed', confidence: 1, excerpt: 'x', observedAt: null, url: null, ...over } as Evidence);

describe('scoring never trusts malformed numbers', () => {
  it('clamp01 treats NaN/Infinity as 0', () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clamp01(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
  });
  it('unknown source kinds and NaN confidence score 0 and read as uncertain', () => {
    expect(evidenceQuality(ev({ sourceKind: 'made_up' as Evidence['sourceKind'] }))).toBe(0);
    expect(evidenceQuality(ev({ confidence: Number.NaN }))).toBe(0);
    expect(isUncertain(ev({ confidence: Number.NaN }))).toBe(true);
  });
});

describe('nearby gates fail closed', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  const base = (userId: string, over: Partial<NearbyParticipant> = {}): NearbyParticipant => ({
    userId, enabled: true, sessionExpiresAt: null, radiusM: 100, audience: 'everyone', minRelevance: 1, skills: ['rust'], interests: ['climbing'], blocked: [],
    sample: { lat: 37.77, lng: -122.41, accuracyM: 10, recordedAt: now.toISOString() }, ...over,
  } as NearbyParticipant);
  it('accepts a sane pair', () => {
    expect(evaluatePair(base('a'), base('b'), { now }).eligible).toBe(true);
  });
  it('rejects NaN radius, NaN accuracy, out-of-range coordinates and future-dated samples', () => {
    expect(evaluatePair(base('a', { radiusM: Number.NaN }), base('b'), { now }).reasons).toContain('invalid_input');
    expect(evaluatePair(base('a', { sample: { lat: 37.77, lng: -122.41, accuracyM: Number.NaN, recordedAt: now.toISOString() } }), base('b'), { now }).eligible).toBe(false);
    expect(evaluatePair(base('a', { sample: { lat: 95, lng: -122.41, accuracyM: 10, recordedAt: now.toISOString() } }), base('b'), { now }).reasons).toContain('invalid_input');
    const future = new Date(now.getTime() + 10 * 60_000).toISOString();
    expect(evaluatePair(base('a', { sample: { lat: 37.77, lng: -122.41, accuracyM: 10, recordedAt: future } }), base('b'), { now }).reasons).toContain('stale_location');
    expect(evaluatePair(base('a', { sample: { lat: 37.77, lng: -122.41, accuracyM: 10, recordedAt: 'not a date' } }), base('b'), { now }).reasons).toContain('stale_location');
    expect(evaluatePair(base('a', { sessionExpiresAt: 'garbage' }), base('b'), { now }).reasons).toContain('session_expired');
    expect(evaluatePair(base('a', { minRelevance: Number.NaN }), base('b'), { now }).eligible).toBe(false);
  });
});

describe('outreach URIs only carry a plain address', () => {
  const draft = { subject: 'Hi & hello', body: 'Line 1\nLine 2', kind: 'direct' as const };
  it('drops addresses that smuggle extra recipients', () => {
    expect(mailtoUrl(draft, 'a@b.co?bcc=x%40evil.com&')).toMatch(/^mailto:\?subject=Hi%20%26%20hello&body=/);
    expect(mailtoUrl(draft, 'Maya.Chen@example.com')).toMatch(/^mailto:maya\.chen@example\.com\?subject=/);
    expect(smsUrl(draft, '+1 (415) 555-0100')).toMatch(/^sms:\+14155550100\?&body=/);
    expect(smsUrl(draft, '555,666?body=x')).toMatch(/^sms:\?&body=/);
  });
});

describe('CSV limits and duplicate detection scale', () => {
  it('rejects more rows than the cap', () => {
    const big = Array.from({ length: CSV_LIMITS.maxRows + 1 }, (_, i) => `Person ${i},p${i}@example.com`).join('\n');
    expect(() => parseCsv(big)).toThrow(/rows/);
  });
  it('finds email, url and name duplicates in linear time on a large file', () => {
    const alpha = (i: number) => i.toString(26).split('').map((c) => String.fromCharCode(97 + parseInt(c, 26))).join('');
    const rows: MappedContact[] = Array.from({ length: 20_000 }, (_, i) => ({
      rowIndex: i, displayName: `Person ${alpha(i)}`, email: `p${i}@example.com`, phone: null, company: 'Acme', title: null, profileUrl: `https://www.linkedin.com/in/p${i}/`, city: null, notes: null, skills: [], interests: [], connectedOn: null, howMet: null, warnings: [],
    }));
    rows.push({ ...rows[5], rowIndex: 20_000 });
    rows.push({ ...rows[7], rowIndex: 20_001, email: null, profileUrl: null });
    const t = Date.now();
    const dups = detectDuplicates(rows, [{ id: 'x', displayName: `Person ${alpha(9)}`, email: null, company: 'Acme' }]);
    expect(Date.now() - t).toBeLessThan(2000);
    expect(dups.find((d) => d.rowIndex === 20_000)).toMatchObject({ otherRowIndex: 5, kind: 'email' });
    expect(dups.find((d) => d.rowIndex === 20_001)).toMatchObject({ otherRowIndex: 7, kind: 'name_and_company' });
    expect(dups.find((d) => d.rowIndex === 9)).toMatchObject({ existingId: 'x', kind: 'name_and_company' });
  });
});
