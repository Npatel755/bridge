import { describe, expect, it } from 'vitest';
import { buildTeam, customRole, decomposeProject, findHelpOpportunities, layoutNetwork } from '../src/index.ts';
import { NOW, contact, network, skill, text } from './fixtures.ts';

describe('Build my team', () => {
  it('decomposes a smart bike light into hardware roles plus cyclist testers', () => {
    const roles = decomposeProject('A smart bike light that brightens when cars approach');
    const ids = roles.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['embedded', 'industrial-design', 'manufacturing', 'testers-cycling']));
  });

  it('fills roles from evidence and reports unfilled needs', () => {
    const { contacts, edges } = network();
    const roles = [...decomposeProject('smart bike light'), customRole('Patent advice', ['patents'])];
    const plan = buildTeam('smart bike light', roles, contacts, edges, { now: NOW });
    const embedded = plan.roles.find((r) => r.role.id === 'embedded')!;
    expect(embedded.filled).toBe(true);
    expect(embedded.candidates[0].contactId).toBe('maya');
    expect(plan.unfilled.map((r) => r.title)).toContain('Patent advice');
  });
});

describe('reciprocal matching', () => {
  it('explains both directions from recorded evidence', () => {
    const me = { id: 'me', displayName: 'Nick', skills: ['fundraising'], interests: ['cycling'], goals: ['build a smart bike light'], offers: ['pitch deck feedback'], lookingFor: ['embedded engineers'] };
    const contacts = [contact('m', 'Maya', { claims: [skill('embedded-systems')], goals: [text('looking for help with fundraising')] })];
    const ops = findHelpOpportunities(me, contacts);
    expect(ops[0].youCanHelp[0].yourMatch).toContain('Fundraising');
    expect(ops[0].theyCanHelp).toContain('Embedded systems');
  });
});

describe('graph layout', () => {
  it('distinguishes confirmed, unconfirmed, and follower links', () => {
    const { contacts, edges } = network();
    const g = layoutNetwork(contacts, [...edges, { ...edges[0], id: 'u', status: 'unconfirmed' }], { iterations: 20 });
    expect(g.nodes[0].id).toBe('self');
    expect(g.links.find((l) => l.target === 'lee' && l.direct)!.confirmed).toBe(false);
    expect(g.links.find((l) => l.id === 'u')!.confirmed).toBe(false);
    for (const n of g.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
  });
});
