/** Plugin manifest schema. Validated server-side before a connector is listed, installed, or called. */
export type Capability = 'import.people' | 'import.edges' | 'import.claims' | 'verify.self';
export const CAPABILITIES: Capability[] = ['import.people', 'import.edges', 'import.claims', 'verify.self'];
export type RelationshipType =
  | 'personal'
  | 'colleague'
  | 'mutual_connection'
  | 'follower'
  | 'following'
  | 'unknown';
export const RELATIONSHIP_TYPES: RelationshipType[] = [
  'personal',
  'colleague',
  'mutual_connection',
  'follower',
  'following',
  'unknown',
];

export interface ManifestAuth {
  type: 'none' | 'file' | 'oauth2' | 'api_key';
  accept?: string[];
  scopes?: string[];
  pkce?: boolean;
  authorizeUrl?: string;
  tokenUrl?: string;
}
export interface ManifestService {
  url: string;
  allowedHosts?: string[];
}
export interface ManifestLimits {
  maxRecords?: number;
  maxBytes?: number;
  timeoutMs?: number;
  ratePerHour?: number;
}
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  auth: ManifestAuth;
  capabilities: Capability[];
  relationshipTypes?: RelationshipType[];
  service?: ManifestService;
  limits?: ManifestLimits;
  privacy?: string;
  limitations?: string;
}

export const MANIFEST_DEFAULT_LIMITS: Required<ManifestLimits> = {
  maxRecords: 5000,
  maxBytes: 5_000_000,
  timeoutMs: 10_000,
  ratePerHour: 20,
};
const HARD_LIMITS = { maxRecords: 20_000, maxBytes: 20_000_000, timeoutMs: 30_000, ratePerHour: 200 };

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

const ID_RE = /^[a-z][a-z0-9-]{1,63}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown, max = 500): v is string {
  return typeof v === 'string' && v.length <= max;
}

export function validateManifest(input: unknown): ValidationResult<PluginManifest> {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['manifest must be an object'] };
  const m = input;
  if (!str(m.id, 64) || !ID_RE.test(m.id)) errors.push('id must match ^[a-z][a-z0-9-]{1,63}$');
  if (!str(m.name, 80) || !m.name.trim()) errors.push('name is required (<=80 chars)');
  if (!str(m.version, 32) || !SEMVER_RE.test(m.version)) errors.push('version must be semver');
  if (m.author !== undefined && !str(m.author, 80)) errors.push('author must be a string');
  if (m.description !== undefined && !str(m.description, 1000)) errors.push('description too long');
  if (m.privacy !== undefined && !str(m.privacy, 1000)) errors.push('privacy too long');
  if (m.limitations !== undefined && !str(m.limitations, 1000)) errors.push('limitations too long');

  if (!isRecord(m.auth) || !['none', 'file', 'oauth2', 'api_key'].includes(String(m.auth.type)))
    errors.push('auth.type must be none|file|oauth2|api_key');
  else {
    const a = m.auth;
    if (a.accept !== undefined && (!Array.isArray(a.accept) || !a.accept.every((x) => str(x, 16) && x.startsWith('.'))))
      errors.push('auth.accept must be a list of extensions like ".csv"');
    if (a.type === 'oauth2') {
      if (a.authorizeUrl !== undefined && !isHttpsUrl(a.authorizeUrl)) errors.push('auth.authorizeUrl must be https');
      if (a.tokenUrl !== undefined && !isHttpsUrl(a.tokenUrl)) errors.push('auth.tokenUrl must be https');
      if (a.scopes !== undefined && (!Array.isArray(a.scopes) || !a.scopes.every((x) => str(x, 64))))
        errors.push('auth.scopes must be strings');
    }
  }

  if (!Array.isArray(m.capabilities) || m.capabilities.length === 0) errors.push('capabilities required');
  else
    for (const c of m.capabilities)
      if (!CAPABILITIES.includes(c as Capability)) errors.push(`unknown capability ${String(c)}`);

  if (m.relationshipTypes !== undefined) {
    if (!Array.isArray(m.relationshipTypes)) errors.push('relationshipTypes must be an array');
    else
      for (const r of m.relationshipTypes)
        if (!RELATIONSHIP_TYPES.includes(r as RelationshipType)) errors.push(`unknown relationshipType ${String(r)}`);
  }

  if (m.service !== undefined) {
    if (!isRecord(m.service) || !str(m.service.url, 300)) errors.push('service.url required');
    else {
      const u = safeUrl(m.service.url);
      if (!u) errors.push('service.url invalid');
      else if (u.protocol !== 'https:' && !isLoopbackOrDocker(u.hostname))
        errors.push('service.url must be https (http allowed only for localhost development)');
      if (m.service.allowedHosts !== undefined && (!Array.isArray(m.service.allowedHosts) || !m.service.allowedHosts.every((h) => str(h, 253))))
        errors.push('service.allowedHosts must be hostnames');
    }
  }

  const limits: ManifestLimits = {};
  if (m.limits !== undefined) {
    if (!isRecord(m.limits)) errors.push('limits must be an object');
    else
      for (const k of ['maxRecords', 'maxBytes', 'timeoutMs', 'ratePerHour'] as const) {
        const v = m.limits[k];
        if (v === undefined) continue;
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) errors.push(`limits.${k} must be a positive number`);
        else if (v > HARD_LIMITS[k]) errors.push(`limits.${k} exceeds hard cap ${HARD_LIMITS[k]}`);
        else limits[k] = Math.floor(v);
      }
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors,
    value: {
      id: m.id as string,
      name: (m.name as string).trim(),
      version: m.version as string,
      author: m.author as string | undefined,
      description: m.description as string | undefined,
      auth: m.auth as ManifestAuth,
      capabilities: m.capabilities as Capability[],
      relationshipTypes: m.relationshipTypes as RelationshipType[] | undefined,
      service: m.service as ManifestService | undefined,
      limits: { ...MANIFEST_DEFAULT_LIMITS, ...limits },
      privacy: m.privacy as string | undefined,
      limitations: m.limitations as string | undefined,
    },
  };
}

export function safeUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}
export function isHttpsUrl(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  const u = safeUrl(s);
  return !!u && u.protocol === 'https:';
}
export function isLoopbackOrDocker(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === 'host.docker.internal' || host === '::1' || host === '[::1]';
}

/** Blocks link-local / private / metadata hosts unless explicitly allow-listed (SSRF guard for connector services). */
export function isAllowedServiceHost(host: string, allowedHosts: string[] = []): boolean {
  const h = host.toLowerCase();
  if (allowedHosts.map((x) => x.toLowerCase()).includes(h)) return true;
  if (isLoopbackOrDocker(h)) return false;
  if (h === 'metadata.google.internal' || h.endsWith('.internal') || h.endsWith('.local')) return false;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))
      return false;
  }
  if (h.startsWith('[') || h.includes(':')) return false; // IPv6 literals: not allowed for connectors
  return true;
}
