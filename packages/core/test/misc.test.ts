import { describe, expect, it } from 'vitest';
import { cosine, draftOutreach, hashEmbedding, mailtoUrl } from '../src/index.ts';

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
