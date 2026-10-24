import { describe, expect, it } from 'vitest';
import { extractTags, normalizeTag, normalizeTags, suggestTags, tagLabel } from '../src/index.ts';

describe('tag normalization', () => {
  it('maps synonyms to canonical tags', () => {
    expect(normalizeTag('Embedded')).toBe('embedded-systems');
    expect(normalizeTag('microcontrollers')).toBe('embedded-systems');
    expect(normalizeTag('SolidWorks')).toBe('cad');
    expect(normalizeTag('React Native')).toBe('mobile-development');
    expect(normalizeTag('bikes')).toBe('cycling');
  });
  it('keeps unknown tags as stable slugs', () => {
    expect(normalizeTag('  Underwater Basket Weaving ')).toBe('underwater-basket-weaving');
    expect(normalizeTags(['ML', 'machine learning', 'Machine-Learning'])).toEqual(['machine-learning']);
  });
  it('finds tags in prose without matching short ambiguous aliases', () => {
    const tags = extractTags('She works on embedded systems, is into cycling, and has an ID badge.');
    expect(tags).toContain('embedded-systems');
    expect(tags).toContain('cycling');
    expect(tags).not.toContain('industrial-design');
  });
  it('suggests chips by prefix', () => {
    expect(suggestTags('emb').map((s) => s.tag)).toContain('embedded-systems');
    expect(suggestTags('cyc', 'interest')[0].tag).toBe('cycling');
    expect(tagLabel('pcb-design')).toBe('PCB design');
  });
});
