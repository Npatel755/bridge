import { evidenceQuality, formatDate, isStale, isUncertain, recencyFactor } from './evidence.ts';
import { cleanText, extractTags, relatedTags, tagLabel, tokenize } from './normalize.ts';
import { DIRECT_ROUTE_RELATIONSHIPS, findIntroPaths, type IntroPath } from './paths.ts';
import type { ContactEdge, ContactRecord, Evidence, TextClaim } from './types.ts';

export type AskIntent = 'expertise' | 'introduction' | 'cofounder' | 'general';

export interface ParsedGoal {
  query: string;
  intent: AskIntent;
  /** Canonical tags explicitly mentioned. */
  tags: string[];
  /** Related tags used for partial matches, at lower weight. */
  relatedTags: string[];
  terms: string[];
}

const INTRO_PATTERNS = [/introduc/, /connect me (to|with)/, /\bget in touch with\b/, /\bsomeone (in|at|from)\b/];
const COFOUNDER_PATTERNS = [/co-?found/, /start(ing)? a (startup|company)/, /work on a startup/, /startup with me/, /join (my|a) (startup|team)/];

/** Domain words that imply tags even when no exact skill is named. */
const IMPLIED: [RegExp, string[]][] = [
  [/\b(prototype|prototyping|build a device|gadget)\b/, ['hardware-prototyping']],
  [/\bsmart (bike|light|lamp|lock|device|helmet|sensor)\b/, ['embedded-systems', 'iot']],
  [/\blight(s)?\b/, ['lighting']],
  [/\b(app|application)\b/, ['mobile-development']],
  [/\b(manufactur|factory|production run)/, ['manufacturing']],
];

export function parseGoal(query: string): ParsedGoal {
  const cleaned = cleanText(query);
  let intent: AskIntent = 'general';
  if (COFOUNDER_PATTERNS.some((p) => p.test(cleaned))) intent = 'cofounder';
  else if (INTRO_PATTERNS.some((p) => p.test(cleaned))) intent = 'introduction';

  const tags = new Set(extractTags(query));
  for (const [pattern, implied] of IMPLIED) if (pattern.test(cleaned)) implied.forEach((t) => tags.add(t));
  if (intent === 'cofounder') tags.add('startups');
  if (tags.size && intent === 'general') intent = 'expertise';

  const related = new Set<string>();
  for (const t of tags) for (const r of relatedTags(t)) if (!tags.has(r)) related.add(r);
  return { query, intent, tags: [...tags], relatedTags: [...related], terms: tokenize(query) };
}

export interface Citation {
  field: string;
  value: string;
  sourceLabel: string;
  sourceKind: Evidence['sourceKind'];
  date: string;
  status: Evidence['status'];
  excerpt?: string | null;
}

export interface Route {
  type: 'direct' | 'introduction' | 'none';
  description: string;
  path?: IntroPath;
  possiblePaths?: IntroPath[];
}

export interface Recommendation {
  contactId: string;
  name: string;
  headline?: string | null;
  howYouKnow: string;
  matchedTags: { tag: string; label: string; exact: boolean }[];
  why: string;
  citations: Citation[];
  route: Route;
  suggestedAsk: string;
  uncertainties: string[];
  score: number;
  scoreBreakdown: { expertise: number; relationship: number; access: number; evidence: number; recency: number };
}

export interface AskResult {
  goal: ParsedGoal;
  status: 'ok' | 'no_supported_match';
  recommendations: Recommendation[];
  message: string;
  nextSteps: string[];
  mode: 'deterministic' | 'llm';
}

export interface AskOptions {
  now?: Date;
  limit?: number;
  /** Extra similarity from pgvector/embeddings keyed by contact id (0..1). Optional enhancement only. */
  semantic?: Map<string, number>;
  /** Restrict candidates to a role's tags (used by Build my team). */
  overrideTags?: { tags: string[]; related?: string[] };
}

function citationFor(field: string, value: string, ev: Evidence): Citation {
  return {
    field,
    value,
    sourceLabel: ev.sourceLabel,
    sourceKind: ev.sourceKind,
    date: formatDate(ev.recordedAt),
    status: ev.status,
    excerpt: ev.excerpt ?? null,
  };
}

function textHits(claims: TextClaim[], terms: string[], tags: string[]): TextClaim[] {
  return claims.filter((c) => {
    if (c.evidence.status === 'rejected') return false;
    const ctags = extractTags(c.text);
    if (ctags.some((t) => tags.includes(t))) return true;
    const ctoks = new Set(tokenize(c.text));
    return terms.filter((t) => ctoks.has(t)).length >= 2;
  });
}

export function describeRelationship(c: ContactRecord): string {
  const parts: string[] = [];
  switch (c.relationship) {
    case 'personal':
      parts.push('You know them personally');
      break;
    case 'colleague':
      parts.push('Current or former colleague');
      break;
    case 'mutual_connection':
      parts.push(`Mutual connection${c.relationshipSource ? ` via ${c.relationshipSource.sourceLabel}` : ''} (may be a weak tie)`);
      break;
    case 'follower':
      parts.push(`Follows you${c.relationshipSource ? ` on ${c.relationshipSource.sourceLabel}` : ''}; not a personal connection`);
      break;
    case 'following':
      parts.push(`You follow them${c.relationshipSource ? ` on ${c.relationshipSource.sourceLabel}` : ''}; not a personal connection`);
      break;
    default:
      parts.push('Relationship not recorded');
  }
  if (c.howMet) parts.push(`met ${c.howMet}`);
  if (c.lastInteractionAt) parts.push(`last interaction ${formatDate(c.lastInteractionAt)}`);
  return parts.join('; ');
}

function relationshipScore(c: ContactRecord): number {
  switch (c.relationship) {
    case 'personal':
      return 1;
    case 'colleague':
      return 0.85;
    case 'mutual_connection':
      return 0.5;
    default:
      return 0;
  }
}

function suggestedAskFor(goal: ParsedGoal, c: ContactRecord, labels: string[], route: Route): string {
  const first = c.displayName.split(' ')[0];
  const topic = labels.slice(0, 2).join(' and ') || 'this';
  if (route.type === 'introduction' && route.path) {
    const via = route.path.hops[1]?.name.split(' ')[0] ?? 'your mutual contact';
    return `Ask ${via} whether they'd be comfortable introducing you to ${first} for a short conversation about ${topic}. Share a two-line summary of your goal they can forward.`;
  }
  if (goal.intent === 'cofounder') {
    return `Ask ${first} for a 20-minute call to compare what you each want to build and whether a startup collaboration could fit.`;
  }
  if (goal.intent === 'introduction') {
    return `Ask ${first} whether they know someone they'd recommend for ${topic}, and whether they'd be open to making an introduction.`;
  }
  return `Ask ${first} for 20 minutes of advice on ${topic} for "${goal.query.replace(/\?$/, '')}".`;
}

export function askNetwork(
  query: string,
  contacts: ContactRecord[],
  edges: ContactEdge[],
  opts: AskOptions = {},
): AskResult {
  const now = opts.now ?? new Date();
  const goal = parseGoal(query);
  const tags = opts.overrideTags?.tags ?? goal.tags;
  const related = opts.overrideTags?.related ?? goal.relatedTags;
  const active = contacts.filter((c) => !c.archived);
  const recs: Recommendation[] = [];

  for (const c of active) {
    const citations: Citation[] = [];
    const uncertainties: string[] = [];
    const matched = new Map<string, { exact: boolean }>();
    let expertise = 0;
    let quality = 0;
    let recency = 0;
    let evidenceCount = 0;

    for (const claim of c.claims) {
      if (claim.evidence.status === 'rejected') continue;
      const exact = tags.includes(claim.tag);
      const rel = !exact && related.includes(claim.tag);
      if (!exact && !rel) continue;
      const q = evidenceQuality(claim.evidence);
      const r = recencyFactor(claim.evidence.recordedAt, now);
      const weight = (exact ? 1 : 0.4) * (claim.kind === 'skill' ? 1 : 0.6);
      expertise += weight * q * r;
      quality += q;
      recency += r;
      evidenceCount++;
      if (!matched.has(claim.tag) || exact) matched.set(claim.tag, { exact });
      citations.push(citationFor(claim.kind === 'skill' ? 'Skill' : 'Interest', tagLabel(claim.tag), claim.evidence));
      if (isUncertain(claim.evidence)) uncertainties.push(`${tagLabel(claim.tag)} is an unconfirmed suggestion (${claim.evidence.sourceLabel}).`);
      if (isStale(claim.evidence.recordedAt, now)) uncertainties.push(`${tagLabel(claim.tag)} was last recorded ${formatDate(claim.evidence.recordedAt)} and may be out of date.`);
    }

    const textFields: [string, TextClaim[]][] = [
      ['Goal', c.goals],
      ['Offers', c.offers],
      ['Project', c.projects],
    ];
    for (const [field, claims] of textFields) {
      for (const hit of textHits(claims, goal.terms, tags)) {
        const intentBoost = goal.intent === 'cofounder' && field === 'Goal' ? 1 : 0.5;
        const q = evidenceQuality(hit.evidence);
        expertise += intentBoost * q * recencyFactor(hit.evidence.recordedAt, now);
        quality += q;
        recency += recencyFactor(hit.evidence.recordedAt, now);
        evidenceCount++;
        citations.push(citationFor(field, hit.text, hit.evidence));
        if (isStale(hit.evidence.recordedAt, now)) uncertainties.push(`"${hit.text}" was recorded ${formatDate(hit.evidence.recordedAt)} and may be stale.`);
      }
    }

    if (c.headline && tags.some((t) => extractTags(c.headline!).includes(t)) && c.relationshipSource) {
      expertise += 0.3 * evidenceQuality(c.relationshipSource);
      citations.push(citationFor('Headline', c.headline, c.relationshipSource));
    }

    const semantic = opts.semantic?.get(c.id) ?? 0;
    if (expertise <= 0) continue;
    expertise += 0.15 * semantic;

    const directOk = DIRECT_ROUTE_RELATIONSHIPS.has(c.relationship);
    let route: Route;
    let access = 0;
    if (directOk) {
      route = { type: 'direct', description: describeRelationship(c) };
      access = 1;
    } else {
      const confirmedPaths = findIntroPaths(c.id, active, edges);
      const possible = findIntroPaths(c.id, active, edges, { includeUnconfirmed: true }).filter((p) => !p.confirmed);
      if (confirmedPaths.length) {
        const best = confirmedPaths[0];
        route = {
          type: 'introduction',
          description: `Possible introduction via ${best.hops.slice(1, -1).map((h) => h.name).join(' → ')}. A recorded connection is a route, not a promise they will introduce you.`,
          path: best,
          possiblePaths: possible,
        };
        access = 0.7 / (best.hops.length - 2);
        for (const edge of best.edges) citations.push(citationFor('Connection', `${edge.kind}`, edge.evidence));
      } else {
        route = {
          type: 'none',
          description:
            c.relationship === 'follower' || c.relationship === 'following'
              ? `${describeRelationship(c)}. No recorded introduction path.`
              : 'No recorded relationship or introduction path.',
          possiblePaths: possible,
        };
        if (possible.length) uncertainties.push(`There is an unconfirmed link via ${possible[0].hops[1]?.name}; confirm it before asking for an introduction.`);
      }
    }
    if (c.lastInteractionAt && isStale(c.lastInteractionAt, now)) uncertainties.push(`You last recorded an interaction on ${formatDate(c.lastInteractionAt)}.`);

    const avgQuality = evidenceCount ? quality / evidenceCount : 0;
    const avgRecency = evidenceCount ? recency / evidenceCount : 0;
    const rel = relationshipScore(c);
    const score = Math.round((expertise * 100 + rel * 12 + access * 10 + avgQuality * 4 + avgRecency * 2) * 10) / 10;
    const matchedTags = [...matched.entries()].map(([tag, m]) => ({ tag, label: tagLabel(tag), exact: m.exact }));
    const labels = matchedTags.filter((m) => m.exact).map((m) => m.label);
    const firstCitation = citations[0];
    const why = matchedTags.length
      ? `${c.displayName} has ${matchedTags
          .map((m) => (m.exact ? m.label : `${m.label} (related)`))
          .join(', ')} on record${firstCitation ? `, per ${firstCitation.sourceLabel} (${firstCitation.date})` : ''}.`
      : `${c.displayName}'s recorded ${firstCitation?.field.toLowerCase() ?? 'details'} mention this: "${firstCitation?.value}".`;

    recs.push({
      contactId: c.id,
      name: c.displayName,
      headline: c.headline,
      howYouKnow: describeRelationship(c),
      matchedTags,
      why,
      citations,
      route,
      suggestedAsk: suggestedAskFor(goal, c, labels.length ? labels : matchedTags.map((m) => m.label), route),
      uncertainties: [...new Set(uncertainties)],
      score,
      scoreBreakdown: {
        expertise: round2(expertise),
        relationship: rel,
        access: round2(access),
        evidence: round2(avgQuality),
        recency: round2(avgRecency),
      },
    });
  }

  recs.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const limited = recs.slice(0, opts.limit ?? 8);
  if (!limited.length) {
    return {
      goal,
      status: 'no_supported_match',
      recommendations: [],
      message: tags.length
        ? `Nobody in your network has recorded evidence for ${tags.map(tagLabel).join(', ')} yet.`
        : 'Bridge could not identify a specific skill or topic in that question, and no recorded details match it.',
      nextSteps: [
        'Add a note about someone who might help; Bridge will extract their skills for you to confirm.',
        'Import contacts or connect a plugin to add more people.',
        tags.length ? `Try a broader question, e.g. "Who knows about ${tagLabel(tags[0]).toLowerCase()}?"` : 'Name a skill, industry, or topic in your question.',
      ],
      mode: 'deterministic',
    };
  }
  return {
    goal,
    status: 'ok',
    recommendations: limited,
    message: `${limited.length} ${limited.length === 1 ? 'person' : 'people'} with recorded evidence.`,
    nextSteps: [],
    mode: 'deterministic',
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
