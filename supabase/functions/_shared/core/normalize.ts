import { TAXONOMY, TAXONOMY_BY_TAG, type TaxonomyEntry } from './taxonomy.ts';

export function cleanText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIAS_TO_TAG = new Map<string, string>();
for (const entry of TAXONOMY) {
  ALIAS_TO_TAG.set(cleanText(entry.tag.replace(/-/g, ' ')), entry.tag);
  ALIAS_TO_TAG.set(cleanText(entry.label), entry.tag);
  for (const alias of entry.aliases) ALIAS_TO_TAG.set(cleanText(alias), entry.tag);
}

/** Phrases sorted longest-first so "embedded systems" wins over "embedded". */
const PHRASES = [...ALIAS_TO_TAG.keys()].sort((a, b) => b.length - a.length);

/** Very short aliases are ambiguous inside prose ("id", "pm", "ts"); only honor them as whole tags. */
const PROSE_MIN_ALIAS_LENGTH = 3;
const PROSE_BLOCKLIST = new Set(['id', 'pm', 'ts', 'js', 'ee', 'cv', 'ml', 'vc', 'ops', 'ux', 'ip', 'oss', 'led', 'photo', 'maker', 'making', 'events', 'speaking', 'community', 'security', 'production', 'hardware', 'investor', 'investing', 'founder', 'games', 'climate', 'battery', 'health tech']);

function slugify(input: string): string {
  return cleanText(input).replace(/[./]/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
}

/** Map any user-entered skill or interest to a canonical tag; unknown values become a stable slug. */
export function normalizeTag(input: string): string {
  const cleaned = cleanText(input);
  if (!cleaned) return '';
  const known = ALIAS_TO_TAG.get(cleaned);
  if (known) return known;
  const singular = cleaned.endsWith('s') ? ALIAS_TO_TAG.get(cleaned.slice(0, -1)) : undefined;
  if (singular) return singular;
  return slugify(cleaned).slice(0, 60);
}

export function normalizeTags(inputs: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const input of inputs) {
    const tag = normalizeTag(input);
    if (tag) out.add(tag);
  }
  return [...out];
}

export function tagLabel(tag: string): string {
  const entry = TAXONOMY_BY_TAG.get(tag);
  if (entry) return entry.label;
  const words = tag.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function taxonomyEntry(tag: string): TaxonomyEntry | undefined {
  return TAXONOMY_BY_TAG.get(tag);
}

export function relatedTags(tag: string): string[] {
  return TAXONOMY_BY_TAG.get(tag)?.related ?? [];
}

export interface TagMention {
  tag: string;
  phrase: string;
  index: number;
}

/** Find canonical tags mentioned in free text (word-boundary match, longest phrase first). */
export function findTagMentions(text: string): TagMention[] {
  const cleaned = ` ${cleanText(text)} `;
  const taken: boolean[] = new Array(cleaned.length).fill(false);
  const mentions: TagMention[] = [];
  for (const phrase of PHRASES) {
    if (phrase.length < PROSE_MIN_ALIAS_LENGTH || PROSE_BLOCKLIST.has(phrase)) continue;
    let from = 0;
    while (true) {
      const idx = cleaned.indexOf(` ${phrase}`, from);
      if (idx < 0) break;
      const start = idx + 1;
      const end = start + phrase.length;
      const after = cleaned[end] ?? ' ';
      const okBoundary = after === ' ' || after === '.' || after === ',' || (after === 's' && (cleaned[end + 1] ?? ' ') === ' ');
      if (okBoundary && !taken.slice(start, end).some(Boolean)) {
        for (let i = start; i < end; i++) taken[i] = true;
        mentions.push({ tag: ALIAS_TO_TAG.get(phrase)!, phrase, index: start - 1 });
      }
      from = end;
    }
  }
  return mentions.sort((a, b) => a.index - b.index);
}

export function extractTags(text: string): string[] {
  return [...new Set(findTagMentions(text).map((m) => m.tag))];
}

/** Searchable chip suggestions for onboarding and editors. */
export function suggestTags(query: string, kind?: 'skill' | 'interest', limit = 8): { tag: string; label: string }[] {
  const q = cleanText(query);
  if (!q) return [];
  const scored: { tag: string; label: string; score: number }[] = [];
  for (const entry of TAXONOMY) {
    if (kind && !entry.kinds.includes(kind)) continue;
    const names = [entry.label, ...entry.aliases].map(cleanText);
    let best = 0;
    for (const name of names) {
      if (name === q) best = Math.max(best, 3);
      else if (name.startsWith(q)) best = Math.max(best, 2);
      else if (name.includes(q)) best = Math.max(best, 1);
    }
    if (best > 0) scored.push({ tag: entry.tag, label: entry.label, score: best });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ tag, label }) => ({ tag, label }));
}

export function tokenize(text: string): string[] {
  return cleanText(text)
    .split(/[\s/.-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export const STOPWORDS = new Set(
  'a an and are as at be but by can could do does for from has have help how i in into is it its know me my of on or our so some someone that the their them they this to up us was we what who whom with would you your anyone people person find need want looking'.split(
    ' ',
  ),
);

const EMAIL_RE = /^[^\s@?&#%,;:<>()[\]\\"]+@[^\s@?&#%,;:<>()[\]\\"]+\.[A-Za-z0-9-]{2,}$/;

/** Plain address or '' (rejects query/fragment characters that would smuggle cc/bcc into a mailto:). */
export function safeEmail(email?: string | null): string {
  const e = (email ?? '').trim();
  return EMAIL_RE.test(e) ? e.toLowerCase() : '';
}

/** Digits with an optional leading +, or '' (sms: targets cannot carry extra recipients or params). */
export function safePhone(phone?: string | null): string {
  const p = (phone ?? '').replace(/[\s().-]/g, '');
  return /^\+?\d{3,20}$/.test(p) ? p : '';
}
