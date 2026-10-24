/** LinkedIn "Connections.csv" importer. Pure function; runs inside the Bridge plugin host. */
import { parseCsv, findHeaderRow, guessMapping, mapRows, extractTags, tagLabel } from '../../../packages/core/src/index.ts';
import type { ConnectorRequest, ConnectorResponse, ImportedPerson, ImportedEdge } from '../../../packages/plugin-sdk/src/index.ts';

const SRC = 'linkedin_export';

export function runLinkedInExport(req: ConnectorRequest): ConnectorResponse {
  if (req.op === 'health') return { ok: true, records: [] };
  if (!req.fileText) return { ok: false, error: 'Upload your LinkedIn Connections.csv' };
  if (req.fileText.length > req.context.limits.maxBytes) return { ok: false, error: 'File too large' };
  const rows = parseCsv(req.fileText);
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) return { ok: false, error: 'Could not find a header row (expected "First Name, Last Name, URL, Email Address, Company, Position, Connected On")' };
  const header = rows[headerIdx];
  const mapping = guessMapping(header);
  if (mapping.firstName === undefined && mapping.fullName === undefined) return { ok: false, error: 'No name column found' };
  const mapped = mapRows(rows.slice(headerIdx + 1), mapping);
  const retrievedAt = new Date().toISOString();
  const warnings: string[] = [];
  const records: (ImportedPerson | ImportedEdge)[] = [];
  let skipped = 0;
  for (const m of mapped.slice(0, req.context.limits.maxRecords)) {
    if (!m.displayName) { skipped++; continue; }
    const url = m.profileUrl || undefined;
    const providerId = url ? url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, '').replace(/\/$/, '') : `name:${m.displayName.toLowerCase()}`;
    const prov = (field: string) => ({ source: `${SRC}:${field}`, retrievedAt, url });
    const provenance: ImportedPerson['provenance'] = { name: prov('First Name/Last Name') };
    if (m.email) provenance.email = prov('Email Address');
    if (m.company) provenance.company = prov('Company');
    if (m.title) provenance.headline = prov('Position');
    const suggested = m.title
      ? extractTags(m.title).slice(0, 4).map((tag) => ({ kind: 'skill' as const, tag, label: tagLabel(tag), basis: `Position title "${m.title}" (unconfirmed)` }))
      : [];
    const [firstName, ...rest] = m.displayName.split(/\s+/);
    records.push({
      kind: 'person', providerId, sourceUrl: url, name: m.displayName, firstName, lastName: rest.join(' ') || undefined,
      email: m.email || undefined, headline: m.title || undefined, company: m.company || undefined,
      relationship: 'mutual_connection', direction: 'mutual', connectedAt: m.connectedOn ? parseLinkedInDate(m.connectedOn) : undefined,
      confidence: 0.7, provenance, suggestedTags: suggested,
    });
    records.push({ kind: 'edge', fromProviderId: null, toProviderId: providerId, edgeKind: 'knows', confidence: 0.6, provenance: prov('Connected On') });
    for (const w of m.warnings) warnings.push(`Row ${m.rowIndex + 1}: ${w}`);
  }
  if (mapped.length > req.context.limits.maxRecords) warnings.push(`Only the first ${req.context.limits.maxRecords} rows were imported.`);
  if (skipped) warnings.push(`${skipped} rows without a name were skipped.`);
  if (mapping.email === undefined) warnings.push('No email column: LinkedIn only exports emails your connections chose to share.');
  return { ok: true, records, warnings, stats: { rows: mapped.length, people: records.filter((r) => r.kind === 'person').length, skipped } };
}

export function parseLinkedInDate(s: string): string | undefined {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
