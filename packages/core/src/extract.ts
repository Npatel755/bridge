import { findTagMentions, normalizeTag } from './normalize.ts';
import { normalizeName } from './csv.ts';
import type { TagKind } from './types.ts';

export interface ExtractedTag {
  tag: string;
  kind: TagKind;
  phrase: string;
}

export interface CandidateMatch {
  contactId: string;
  displayName: string;
  reason: 'exact_full_name' | 'first_name' | 'alias';
}

export interface ExtractedPerson {
  /** Stable key within this extraction, used to reference people in connections. */
  key: string;
  mention: string;
  resolution: 'new' | 'possible_match' | 'ambiguous';
  candidates: CandidateMatch[];
  tags: ExtractedTag[];
  goals: string[];
  organizations: string[];
  roles: string[];
}

export interface ExtractedConnection {
  fromKey: string;
  toKey: string;
  kind: 'knows' | 'works_with';
  phrase: string;
}

export interface NoteExtraction {
  people: ExtractedPerson[];
  connections: ExtractedConnection[];
  howMet: string | null;
  ownerGoals: string[];
  mode: 'deterministic' | 'llm';
  /** Everything extracted is a suggestion until the user confirms it. */
  status: 'suggested';
}

const NOT_NAMES = new Set(
  'I Me My We Our He She They Them His Her Their It Its The A An And But Or So Then Met Meet Meeting Talked Spoke Chatted Saw Today Yesterday Tomorrow Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Also Both Who Works Knows Interested Looking Wants Great Good Nice Follow Followup Next Call Email Coffee Lunch Dinner At In On With From Hackathon Demo Day Conference Meetup This That There Here Should Could Would Will Need'.split(
    ' ',
  ),
);

const ORG_SUFFIX = /\b(Inc|LLC|Labs?|University|College|Institute|Corp|Company|Co|Ltd|Studio|Studios|Robotics|Systems|Technologies|Ventures|Capital|School)\b/;
const INTEREST_CUES = /\b(interested in|interest in|into|passionate about|loves?|enjoys?|curious about|excited about|fan of|cares about|rides?|is a (?:big )?(?:fan|enthusiast))\b/i;
const GOAL_CUES = /\b(looking (?:for|to)|wants? to|hoping to|hopes to|plans? to|trying to|interested in joining|interested in starting|open to|seeking|thinking about)\b/i;
const SKILL_CUES = /\b(works? on|working on|expert in|experience (?:with|in)|specializ\w* in|builds?|building|designs?|designing|knows? (?:a lot )?about|does|leads?|teaches|manages|runs|engineer|developer|designer)\b/i;

interface Mention {
  name: string;
  index: number;
}

function findNameMentions(sentence: string, offset: number): Mention[] {
  const out: Mention[] = [];
  const re = /\b([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) {
    const words = m[1].split(/\s+/).filter((w) => !NOT_NAMES.has(w));
    if (!words.length) continue;
    const name = words.join(' ');
    const before = sentence.slice(0, m.index);
    if (/\b(at|for|from)\s+$/i.test(before) || ORG_SUFFIX.test(sentence.slice(m.index, m.index + m[1].length + 15))) continue;
    out.push({ name, index: offset + m.index });
  }
  return out;
}

function findOrganizations(sentence: string): string[] {
  const out: string[] = [];
  const re = /\b(?:works? (?:at|for)|working (?:at|for)|employed at|joined|from|at)\s+((?:[A-Z][\w&'’-]*)(?:\s+[A-Z][\w&'’-]*){0,3})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) {
    const org = m[1].trim();
    if (!NOT_NAMES.has(org)) out.push(org);
  }
  return out;
}

function splitSentences(text: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  const re = /[^.!?\n]+[.!?]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (m[0].trim()) out.push({ text: m[0], offset: m.index });
  return out;
}

/** Split into clauses on commas/"and"/"who"; each clause keeps its own subject. */
function splitClauses(sentence: string): string[] {
  return sentence
    .split(/,|;|\band\b(?=\s+(?:is|works|knows|wants|loves|has|she|he|they|runs|manages|leads|builds))/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface KnownContact {
  id: string;
  displayName: string;
  aliases?: string[];
}

export function resolveCandidates(mention: string, known: KnownContact[]): { resolution: ExtractedPerson['resolution']; candidates: CandidateMatch[] } {
  const target = normalizeName(mention);
  const exact = known.filter((k) => normalizeName(k.displayName) === target || (k.aliases ?? []).some((a) => normalizeName(a) === target));
  if (exact.length === 1) return { resolution: 'possible_match', candidates: exact.map((k) => ({ contactId: k.id, displayName: k.displayName, reason: 'exact_full_name' })) };
  if (exact.length > 1) return { resolution: 'ambiguous', candidates: exact.map((k) => ({ contactId: k.id, displayName: k.displayName, reason: 'exact_full_name' })) };
  const firstName = target.split(' ')[0];
  const partial = known.filter((k) => normalizeName(k.displayName).split(' ')[0] === firstName);
  if (!partial.length) return { resolution: 'new', candidates: [] };
  return {
    resolution: partial.length === 1 && !target.includes(' ') ? 'possible_match' : 'ambiguous',
    candidates: partial.map((k) => ({ contactId: k.id, displayName: k.displayName, reason: 'first_name' })),
  };
}

/**
 * Deterministic note extraction. Attributes skills/interests/goals to the most recent person
 * mentioned (or the subject of a "who ..." clause). Output is always a suggestion for review.
 */
export function extractFromNote(note: string, known: KnownContact[] = []): NoteExtraction {
  const people = new Map<string, ExtractedPerson>();
  const connections: ExtractedConnection[] = [];
  const ownerGoals: string[] = [];
  let howMet: string | null = null;

  const metMatch = note.match(/\bmet\s+(?:[A-Z][a-z]+\s+)?((?:at|during|through|via|in)\s+[^.,;]+)/i);
  if (metMatch) howMet = metMatch[1].trim();

  const ensure = (name: string): ExtractedPerson => {
    let key = normalizeName(name);
    if (!key.includes(' ')) {
      const existing = [...people.keys()].filter((k) => k.split(' ')[0] === key);
      if (existing.length === 1) key = existing[0];
    }
    let p = people.get(key);
    if (!p) {
      const { resolution, candidates } = resolveCandidates(name, known);
      p = { key, mention: name, resolution, candidates, tags: [], goals: [], organizations: [], roles: [] };
      people.set(key, p);
    }
    return p;
  };

  let subject: ExtractedPerson | null = null;
  for (const sentence of splitSentences(note)) {
    const mentions = findNameMentions(sentence.text, sentence.offset);
    const firstPerson = /^\s*(i|we)\b/i.test(sentence.text) && !mentions.length;
    for (const clause of splitClauses(sentence.text)) {
      const clauseMentions = findNameMentions(clause, 0);
      const whoMatch = clause.match(/^([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?)\s+who\b/) ?? clause.match(/^who\b/i);
      if (clauseMentions.length && !/^(she|he|they)\b/i.test(clause)) {
        const knowsIdx = clause.search(/\b(knows|introduced me to|works with|is friends with|friend of)\b/i);
        if (knowsIdx >= 0 && subject) {
          const after = findNameMentions(clause.slice(knowsIdx), 0);
          for (const m of after) {
            if (normalizeName(m.name) === subject.key) continue;
            const other = ensure(m.name);
            const kind = /works with/i.test(clause) ? 'works_with' : 'knows';
            connections.push({ fromKey: subject.key, toKey: other.key, kind, phrase: clause.trim() });
            subject = other;
            const rest = clause.slice(knowsIdx).replace(/^.*?\bwho\b/i, '');
            if (rest !== clause.slice(knowsIdx)) attribute(other, rest);
          }
          continue;
        }
        subject = ensure(clauseMentions[0].name);
      } else if (whoMatch && whoMatch[1]) {
        subject = ensure(whoMatch[1]);
      }
      if (firstPerson && !subject) {
        if (GOAL_CUES.test(clause)) ownerGoals.push(clause.trim());
        continue;
      }
      if (subject) attribute(subject, clause);
    }
    for (const org of findOrganizations(sentence.text)) {
      if (subject && !subject.organizations.includes(org)) subject.organizations.push(org);
    }
  }

  function attribute(p: ExtractedPerson, clause: string) {
    const mentionsInClause = findTagMentions(clause);
    const goal = GOAL_CUES.test(clause);
    const interest = INTEREST_CUES.test(clause);
    const skill = SKILL_CUES.test(clause);
    for (const m of mentionsInClause) {
      const kind: TagKind = interest && !skill ? 'interest' : skill ? 'skill' : goal ? 'interest' : 'skill';
      if (!p.tags.some((t) => t.tag === m.tag && t.kind === kind)) p.tags.push({ tag: m.tag, kind, phrase: m.phrase });
    }
    if (goal) {
      const g = clause.replace(/^(she|he|they)\s+(is\s+)?/i, '').trim();
      if (!p.goals.includes(g)) p.goals.push(g);
    }
    const role = clause.match(/\b(?:is an?|works as an?|manages|runs|leads)\s+([a-z][a-z\s-]{2,40})/i);
    if (role) {
      const r = role[0].replace(/^is an?\s+/i, '').trim();
      if (!p.roles.includes(r)) p.roles.push(r);
      const roleTag = normalizeTag(role[1]);
      if (/makerspace/.test(roleTag) && !p.tags.some((t) => t.tag === 'community-building')) p.tags.push({ tag: 'community-building', kind: 'skill', phrase: role[0] });
    }
  }

  return { people: [...people.values()], connections, howMet, ownerGoals, mode: 'deterministic', status: 'suggested' };
}
