import { cleanText } from './normalize.ts';

/** RFC 4180-ish CSV parser (quotes, escaped quotes, CRLF, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
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
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
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
    const email = get(r, 'email');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) warnings.push('Email looks invalid and will be skipped.');
    const url = get(r, 'profileUrl');
    if (url && !/^https?:\/\//i.test(url)) warnings.push('Profile URL is not an http(s) link and will be skipped.');
    out.push({
      rowIndex,
      displayName: name.slice(0, 120),
      email: email && warnings.length === 0 ? email.toLowerCase() : email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email.toLowerCase() : null,
      phone: get(r, 'phone'),
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
  const out: DuplicateCandidate[] = [];
  const seenRows: MappedContact[] = [];
  for (const row of rows) {
    const name = normalizeName(row.displayName);
    const url = normalizeUrl(row.profileUrl);
    const company = row.company ? cleanText(row.company) : null;
    const check = (other: { email?: string | null; profileUrl?: string | null; displayName: string; company?: string | null }): DuplicateKind | null => {
      if (row.email && other.email && row.email === other.email.toLowerCase()) return 'email';
      if (url && normalizeUrl(other.profileUrl) === url) return 'profile_url';
      if (name && normalizeName(other.displayName) === name) {
        if (company && other.company && cleanText(other.company) === company) return 'name_and_company';
        return 'name_only';
      }
      return null;
    };
    let found = false;
    for (const ex of existing) {
      const kind = check(ex);
      if (kind) {
        out.push({ rowIndex: row.rowIndex, existingId: ex.id, otherRowIndex: null, kind, strength: kind === 'name_only' ? 'weak' : 'strong' });
        found = true;
        break;
      }
    }
    if (!found) {
      for (const prev of seenRows) {
        const kind = check(prev);
        if (kind) {
          out.push({ rowIndex: row.rowIndex, existingId: null, otherRowIndex: prev.rowIndex, kind, strength: kind === 'name_only' ? 'weak' : 'strong' });
          break;
        }
      }
    }
    seenRows.push(row);
  }
  return out;
}
