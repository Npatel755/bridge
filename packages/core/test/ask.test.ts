import { describe, expect, it } from 'vitest';
import { askNetwork, findIntroPaths, parseGoal } from '../src/index.ts';
import { NOW, contact, network, skill } from './fixtures.ts';

describe('parseGoal', () => {
  it('detects tags and intent', () => {
    const g = parseGoal('Who do I know who can help prototype a smart bike light?');
    expect(g.tags).toEqual(expect.arrayContaining(['cycling', 'hardware-prototyping', 'embedded-systems']));
    expect(parseGoal('Who could introduce me to someone in manufacturing?').intent).toBe('introduction');
    expect(parseGoal('Who might want to work on a startup with me?').intent).toBe('cofounder');
  });
});

describe('askNetwork', () => {
  it('ranks a direct expert first with citations and a direct route', () => {
    const { contacts, edges } = network();
    const res = askNetwork('Who has experience with embedded systems?', contacts, edges, { now: NOW });
    expect(res.status).toBe('ok');
    const top = res.recommendations[0];
    expect(top.contactId).toBe('maya');
    expect(top.route.type).toBe('direct');
    expect(top.citations[0]).toMatchObject({ sourceLabel: 'Your note', date: '2026-09-01' });
    expect(top.suggestedAsk).toMatch(/Maya/);
  });

  it('finds an introduction through a confirmed edge and never through a follower edge', () => {
    const { contacts, edges } = network();
    const res = askNetwork('Who could introduce me to someone in manufacturing?', contacts, edges, { now: NOW });
    const priya = res.recommendations.find((r) => r.contactId === 'priya')!;
    expect(priya.route.type).toBe('introduction');
    expect(priya.route.path!.hops.map((h) => h.id)).toEqual(['self', 'jordan', 'priya']);
    expect(priya.route.description).toMatch(/not a promise/);
  });

  it('does not treat a follower as a warm route', () => {
    const { contacts, edges } = network();
    const res = askNetwork('Who knows computer vision?', contacts, edges, { now: NOW });
    const lee = res.recommendations.find((r) => r.contactId === 'lee')!;
    expect(lee.route.type).toBe('none');
    expect(lee.howYouKnow).toMatch(/not a personal connection/);
    const paths = findIntroPaths('priya', contacts.filter((c) => c.id !== 'jordan'), edges);
    expect(paths).toHaveLength(0);
  });

  it('flags stale and suggested evidence as uncertain', () => {
    const { contacts, edges } = network();
    const sam = askNetwork('industrial design help', contacts, edges, { now: NOW }).recommendations.find((r) => r.contactId === 'sam')!;
    expect(sam.uncertainties.join(' ')).toMatch(/out of date/);
    const ana = askNetwork('Who knows computer vision?', contacts, edges, { now: NOW }).recommendations.find((r) => r.contactId === 'ana')!;
    expect(ana.uncertainties.join(' ')).toMatch(/unconfirmed suggestion/);
  });

  it('returns a useful no-match result instead of inventing people', () => {
    const { contacts, edges } = network();
    const res = askNetwork('Who knows about underwater welding?', contacts, edges, { now: NOW });
    expect(res.status).toBe('no_supported_match');
    expect(res.recommendations).toHaveLength(0);
    expect(res.nextSteps.length).toBeGreaterThan(0);
  });

  it('ignores rejected claims and archived contacts', () => {
    const contacts = [
      contact('x', 'X', { claims: [skill('rust', { status: 'rejected' })] }),
      contact('y', 'Y', { archived: true, claims: [skill('rust')] }),
    ];
    expect(askNetwork('who knows rust', contacts, [], { now: NOW }).status).toBe('no_supported_match');
  });

  it('matches cofounder intent against recorded goals', () => {
    const { contacts, edges } = network();
    const res = askNetwork('Who might want to work on a startup with me?', contacts, edges, { now: NOW });
    expect(res.recommendations[0].contactId).toBe('maya');
    expect(res.recommendations[0].citations.some((c) => c.field === 'Goal')).toBe(true);
  });
});
