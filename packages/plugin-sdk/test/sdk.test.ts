import { describe, it, expect } from 'vitest';
import { validateManifest, validateResponse, isAllowedServiceHost } from '../src/index.ts';
import { runLinkedInExport } from '../../../plugins/linkedin-export/src/index.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const ctx = { pluginId: 'linkedin-export', subjectId: 's', limits: { maxRecords: 100, maxBytes: 100000 } };

describe('manifest', () => {
  it('accepts the shipped manifests', () => {
    for (const p of ['plugins/linkedin-export/manifest.json', 'plugins/community-example/manifest.json', 'plugins/template/manifest.json']) {
      const r = validateManifest(JSON.parse(readFileSync(join(root, p), 'utf8')));
      expect(r.errors).toEqual([]);
    }
  });
  it('rejects bad ids, http services, unknown capabilities, huge limits', () => {
    const r = validateManifest({ id: 'Bad Id', name: 'x', version: '1', auth: { type: 'none' }, capabilities: ['hack.everything'], service: { url: 'http://evil.example.com' }, limits: { maxRecords: 1e9 } });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(5);
  });
  it('blocks private and metadata hosts', () => {
    expect(isAllowedServiceHost('169.254.169.254')).toBe(false);
    expect(isAllowedServiceHost('10.0.0.5')).toBe(false);
    expect(isAllowedServiceHost('metadata.google.internal')).toBe(false);
    expect(isAllowedServiceHost('127.0.0.1')).toBe(false);
    expect(isAllowedServiceHost('127.0.0.1', ['127.0.0.1'])).toBe(true);
    expect(isAllowedServiceHost('connector.example.com')).toBe(true);
  });
});

describe('response validation', () => {
  it('sanitizes fixture output and rejects invalid records', () => {
    const fx = JSON.parse(readFileSync(join(root, 'plugins/community-example/fixtures/people.json'), 'utf8'));
    const r = validateResponse(fx, 'community-example', 500);
    expect(r.ok).toBe(true);
    expect(r.records!.length).toBe(7);
    expect(r.rejected.map((x) => x.reason)).toEqual(['person.name required', 'edge.edgeKind invalid']);
    const lee = r.records!.find((x) => x.kind === 'person' && x.name === 'Lee Zhang')!;
    expect(lee.kind === 'person' && lee.relationship).toBe('follower');
  });
  it('drops javascript: urls and control chars, caps confidence', () => {
    const r = validateResponse({ ok: true, records: [{ kind: 'person', name: 'A\u0000B', sourceUrl: 'javascript:alert(1)', relationship: 'personal', confidence: 7, provenance: {} }] }, 'x', 10);
    const p = r.records![0] as any;
    expect(p.name).toBe('AB');
    expect(p.sourceUrl).toBeUndefined();
    expect(p.confidence).toBe(1);
  });
  it('fails closed on non-ok or malformed responses', () => {
    expect(validateResponse({ ok: false, error: 'nope' }, 'x', 10).ok).toBe(false);
    expect(validateResponse('garbage', 'x', 10).ok).toBe(false);
    expect(validateResponse({ ok: true, records: 'x' }, 'x', 10).rejected[0].reason).toMatch(/array/);
  });
});

describe('linkedin export connector', () => {
  it('imports the fixture CSV as mutual connections with provenance and suggested tags', () => {
    const text = readFileSync(join(root, 'plugins/linkedin-export/fixtures/Connections.csv'), 'utf8');
    const res = runLinkedInExport({ op: 'import', context: ctx, fileText: text, fileName: 'Connections.csv' });
    expect(res.ok).toBe(true);
    const v = validateResponse(res, 'linkedin-export', 100);
    const people = v.records!.filter((r) => r.kind === 'person') as any[];
    expect(people.map((p) => p.name)).toEqual(['Raj Patel', 'Grace Liu', 'Dana Whitfield', 'Ignore Me, Please; <script>alert(1)</script>']);
    expect(people.every((p) => p.relationship === 'mutual_connection')).toBe(true);
    expect(people[0].provenance.headline.source).toBe('linkedin_export:Position');
    expect(people[0].suggestedTags.map((t: any) => t.tag)).toContain('product-management');
    const evil = people[3];
    expect(evil.sourceUrl).toBeUndefined(); // javascript: dropped
    expect(evil.email).toBe('not-an-email'); // kept as text, flagged downstream by core csv warnings, never used as a claim
    expect(evil.suggestedTags.map((t: any) => t.tag)).not.toContain('expert');
    expect(res.warnings!.some((w) => w.includes('skipped'))).toBe(true);
  });
  it('fails without a header row', () => {
    expect(runLinkedInExport({ op: 'import', context: ctx, fileText: 'a,b\n1,2' }).ok).toBe(false);
  });
});
