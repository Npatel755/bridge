import { extractTags, tokenize } from './normalize.ts';

export const EMBEDDING_DIMS = 256;

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic lexical "hashing" embedding used when no embedding provider is configured.
 * Canonical tags get extra weight so synonyms ("firmware" vs "embedded") land closer.
 * This is not a semantic model and is labeled as a fallback wherever it is surfaced.
 */
export function hashEmbedding(text: string, dims = EMBEDDING_DIMS): number[] {
  const v = new Array<number>(dims).fill(0);
  const tokens = tokenize(text);
  const add = (feature: string, weight: number) => {
    const h = fnv1a(feature);
    v[h % dims] += (h & 0x80000000 ? -1 : 1) * weight;
  };
  tokens.forEach((t, i) => {
    add(`u:${t}`, 1);
    if (i > 0) add(`b:${tokens[i - 1]}_${t}`, 0.5);
  });
  for (const tag of extractTags(text)) add(`t:${tag}`, 2.5);
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => Number((x / norm).toFixed(6)));
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
