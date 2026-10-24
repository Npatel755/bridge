import { evidenceQuality, formatDate } from './evidence.ts';
import { extractTags, normalizeTags, tagLabel } from './normalize.ts';
import type { ContactRecord, OwnerProfile } from './types.ts';

export interface HelpOpportunity {
  contactId: string;
  name: string;
  /** What they are looking for that you can offer. */
  youCanHelp: { need: string; yourMatch: string[]; source: string; date: string }[];
  /** What they have that matches your goals (only from recorded evidence). */
  theyCanHelp: string[];
  score: number;
}

/** Surface people whose recorded goals match what the owner can offer, explaining both directions. */
export function findHelpOpportunities(me: OwnerProfile, contacts: ContactRecord[], limit = 6): HelpOpportunity[] {
  const myTags = new Set([...normalizeTags(me.skills), ...normalizeTags(me.offers.flatMap(extractTags)), ...me.offers.flatMap(extractTags)]);
  const myGoalTags = new Set([...me.goals.flatMap(extractTags), ...me.lookingFor.flatMap(extractTags), ...normalizeTags(me.interests)]);
  const out: HelpOpportunity[] = [];
  for (const c of contacts) {
    if (c.archived) continue;
    const youCanHelp: HelpOpportunity['youCanHelp'] = [];
    let score = 0;
    for (const goal of c.goals) {
      if (goal.evidence.status === 'rejected') continue;
      const overlap = extractTags(goal.text).filter((t) => myTags.has(t));
      if (!overlap.length) continue;
      youCanHelp.push({ need: goal.text, yourMatch: overlap.map(tagLabel), source: goal.evidence.sourceLabel, date: formatDate(goal.evidence.recordedAt) });
      score += overlap.length * evidenceQuality(goal.evidence);
    }
    if (!youCanHelp.length) continue;
    const theyCanHelp = [...new Set(c.claims.filter((cl) => cl.kind === 'skill' && cl.evidence.status !== 'rejected' && myGoalTags.has(cl.tag)).map((cl) => tagLabel(cl.tag)))];
    out.push({ contactId: c.id, name: c.displayName, youCanHelp, theyCanHelp, score: score + theyCanHelp.length * 0.5 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
