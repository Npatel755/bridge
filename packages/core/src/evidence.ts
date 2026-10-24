import type { Evidence, SourceKind } from './types.ts';

const SOURCE_WEIGHT: Record<SourceKind, number> = {
  self_reported: 1,
  manual: 1,
  note: 0.9,
  phone_contacts: 0.6,
  csv_import: 0.75,
  plugin: 0.75,
  demo: 0.9,
  extracted: 0.6,
  ai_suggested: 0.45,
};

export const STALE_AFTER_DAYS = 540;
const DAY_MS = 86_400_000;

export function ageInDays(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now.getTime() - t) / DAY_MS);
}

/** 1.0 for fresh evidence decaying to 0.5 at ~3 years. */
export function recencyFactor(iso: string | null | undefined, now: Date): number {
  const days = ageInDays(iso, now);
  if (days === null) return 0.6;
  if (days <= 180) return 1;
  return Math.max(0.5, 1 - (days - 180) / 1800);
}

export function isStale(iso: string | null | undefined, now: Date): boolean {
  const days = ageInDays(iso, now);
  return days !== null && days > STALE_AFTER_DAYS;
}

export function evidenceQuality(evidence: Evidence): number {
  if (evidence.status === 'rejected') return 0;
  const statusFactor = evidence.status === 'suggested' ? 0.6 : 1;
  return (SOURCE_WEIGHT[evidence.sourceKind] ?? 0) * statusFactor * clamp01(evidence.confidence);
}

export function isUncertain(evidence: Evidence): boolean {
  return evidence.status === 'suggested' || !(evidence.confidence >= 0.6) || evidence.sourceKind === 'ai_suggested';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'undated';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'undated';
  return d.toISOString().slice(0, 10);
}

/** Non-finite input (NaN from bad imports, Infinity) clamps to 0 so it can never inflate a score. */
export function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
