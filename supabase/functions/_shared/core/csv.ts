import { cleanText, safeEmail, safePhone } from './normalize.ts';

export const CSV_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 30_000 } as const;

/** RFC 4180-ish CSV parser (quotes, escaped quotes, CRLF, embedded newlines). */
export function parseCsv(text: string): string[][] {
  if (text.length > CSV_LIMITS.maxBytes) throw new Error(`CSV is larger than ${CSV_LIMITS.maxBytes / 1024 / 1024} MB. Split it into smaller files.`);
  const rows: string[][] = [];
  const pushRow = (r: string[]) => {
    if (rows.length >= CSV_LIMITS.maxRows) throw new Error(`CSV has more than ${CSV_LIMITS.maxRows.toLocaleString()} rows. Split it into smaller files.`);
    rows.push(r);
  };
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      pushRow(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    pushRow(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export const CONTACT_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'phone',
  'company',
  'title',
  'profileUrl',
  'city',
  'notes',
  'skills',
  'interests',
  'connectedOn',
  'howMet',
] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ContactField, number>>;

const HEADER_HINTS: Record<ContactField, string[]> = {
  firstName: ['first name', 'first', 'given name', 'firstname'],
  lastName: ['last name', 'last', 'surname', 'family name', 'lastname'],
  fullName: ['name', 'full name', 'display name', 'contact name'],
  email: ['email', 'email address', 'e-mail', 'mail'],
  phone: ['phone', 'phone number', 'mobile', 'cell'],
  company: ['company', 'organization', 'organisation', 'employer', 'org'],
  title: ['title', 'position', 'job title', 'role', 'headline'],
  profileUrl: ['url', 'profile url', 'linkedin', 'linkedin url', 'profile', 'website'],
  city: ['city', 'location', 'region'],
  notes: ['notes', 'note', 'comments', 'description'],
  skills: ['skills', 'expertise'],
  interests: ['interests', 'topics'],
  connectedOn: ['connected on', 'connected', 'date added'],
  howMet: ['how met', 'how we met', 'met at', 'context'],
};

/** Find the first row that looks like a header (skips preambles such as LinkedIn's "Notes:" block). */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map(cleanText);
    const hits = cells.filter((c) => Object.values(HEADER_HINTS).some((hints) => hints.includes(c))).length;
    if (hits >= 2) return i;
  }
  return 0;
}

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const cleaned = headers.map(cleanText);
  for (const field of CONTACT_FIELDS) {
    const idx = cleaned.findIndex((h, i) => HEADER_HINTS[field].includes(h) && !Object.values(mapping).includes(i));
    if (idx >= 0) mapping[field] = idx;
  }
  return mapping;
}

export interface MappedContact {
  rowIndex: number;
  displayName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  profileUrl: string | null;
  city: string | null;
  notes: string | null;
  skills: string[];
  interests: string[];
  connectedOn: string | null;
  howMet: string | null;
  warnings: string[];
}

const MAX_FIELD = 2000;

export function mapRows(rows: string[][], mapping: ColumnMapping): MappedContact[] {
  const get = (r: string[], f: ContactField) => {
    const i = mapping[f];
    const v = i === undefined ? '' : (r[i] ?? '').trim();
    return v ? v.slice(0, MAX_FIELD) : null;
  };
  const list = (v: string | null) => (v ? v.split(/[;,|]/).map((s) => s.trim()).filter(Boolean) : []);
  const out: MappedContact[] = [];
  rows.forEach((r, rowIndex) => {
    const name = get(r, 'fullName') ?? [get(r, 'firstName'), get(r, 'lastName')].filter(Boolean).join(' ');
    if (!name) return;
    const warnings: string[] = [];
    const rawEmail = get(r, 'email');
    const email = safeEmail(rawEmail) || null;
    if (rawEmail && !email) warnings.push('Email looks invalid and will be skipped.');
    const rawPhone = get(r, 'phone');
    const phone = safePhone(rawPhone) || null;
    if (rawPhone && !phone) warnings.push('Phone number looks invalid and will be skipped.');
    const url = get(r, 'profileUrl');
    if (url && !/^https?:\/\//i.test(url)) warnings.push('Profile URL is not an http(s) link and will be skipped.');
    out.push({
      rowIndex,
      displayName: name.slice(0, 120),
      email,
      phone,
      company: get(r, 'company'),
      title: get(r, 'title'),
      profileUrl: url && /^https?:\/\//i.test(url) ? url : null,
      city: get(r, 'city'),
      notes: get(r, 'notes'),
      skills: list(get(r, 'skills')),
      interests: list(get(r, 'interests')),
      connectedOn: get(r, 'connectedOn'),
      howMet: get(r, 'howMet'),
      warnings,
    });
  });
  return out;
}

export interface ExistingContactKey {
  id: string;
  displayName: string;
  email?: string | null;
  profileUrl?: string | null;
  company?: string | null;
}

export type DuplicateKind = 'email' | 'profile_url' | 'name_and_company' | 'name_only';

export interface DuplicateCandidate {
  rowIndex: number;
  existingId: string | null;
  otherRowIndex: number | null;
  kind: DuplicateKind;
  /** Strong duplicates default to "skip"; name-only matches always need explicit review. */
  strength: 'strong' | 'weak';
}

export function normalizeName(name: string): string {
  return cleanText(name).replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
}

export function detectDuplicates(rows: MappedContact[], existing: ExistingContactKey[]): DuplicateCandidate[] {
  type Ref = { existingId: string | null; otherRowIndex: number | null; company: string | null };
  const byEmail = new Map<string, Ref>();
  const byUrl = new Map<string, Ref>();
  const byName = new Map<string, Ref[]>();
  const index = (key: { email?: string | null; profileUrl?: string | null; displayName: string; company?: string | null }, ref: Ref) => {
    const email = key.email?.toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, ref);
    const url = normalizeUrl(key.profileUrl);
    if (url && !byUrl.has(url)) byUrl.set(url, ref);
    const name = normalizeName(key.displayName);
    if (name) {
      const list = byName.get(name) ?? [];
      list.push(ref);
      byName.set(name, list);
    }
  };
  for (const ex of existing) index(ex, { existingId: ex.id, otherRowIndex: null, company: ex.company ? cleanText(ex.company) : null });

  const out: DuplicateCandidate[] = [];
  for (const row of rows) {
    const company = row.company ? cleanText(row.company) : null;
    let hit: { ref: Ref; kind: DuplicateKind } | null = null;
    const emailRef = row.email ? byEmail.get(row.email) : undefined;
    const url = normalizeUrl(row.profileUrl);
    const urlRef = url ? byUrl.get(url) : undefined;
    if (emailRef) hit = { ref: emailRef, kind: 'email' };
    else if (urlRef) hit = { ref: urlRef, kind: 'profile_url' };
    else {
      // Existing cards win over earlier rows (indexed first); the kind depends on the chosen candidate's company.
      const cand = byName.get(normalizeName(row.displayName))?.[0];
      if (cand) hit = { ref: cand, kind: company && cand.company === company ? 'name_and_company' : 'name_only' };
    }
    if (hit) {
      out.push({ rowIndex: row.rowIndex, existingId: hit.ref.existingId, otherRowIndex: hit.ref.otherRowIndex, kind: hit.kind, strength: hit.kind === 'name_only' ? 'weak' : 'strong' });
    }
    index(row, { existingId: null, otherRowIndex: row.rowIndex, company });
  }
  return out;
}
