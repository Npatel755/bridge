/** JSON protocol between the Bridge plugin host (Edge Function) and a connector service.
 *  Connectors never run inside the mobile app. All payloads are validated by the host. */
import type { RelationshipType } from './manifest.ts';

export interface ConnectorContext {
  pluginId: string;
  /** Opaque per-user, per-connector id; never the Bridge user id. */
  subjectId: string;
  cursor?: Record<string, unknown>;
  limits: { maxRecords: number; maxBytes: number };
  /** Decrypted credential handed to the connector for this call only (OAuth token / API key). */
  credential?: { kind: 'oauth2' | 'api_key'; token: string };
}

export interface ConnectorRequest {
  op: 'preview' | 'import' | 'sync' | 'health';
  context: ConnectorContext;
  /** For file-based connectors: the uploaded file as text (host enforces maxBytes). */
  fileText?: string;
  fileName?: string;
}

export interface FieldProvenance {
  source: string; // e.g. "linkedin_export:Position"
  retrievedAt: string; // ISO
  url?: string;
}

export interface ImportedPerson {
  kind: 'person';
  providerId?: string;
  sourceUrl?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  headline?: string;
  company?: string;
  school?: string;
  location?: string;
  /** The relationship between the Bridge user and this person, as asserted by the provider. */
  relationship: RelationshipType;
  direction?: 'outbound' | 'inbound' | 'mutual';
  connectedAt?: string;
  confidence: number; // 0..1
  provenance: Record<string, FieldProvenance>;
  /** Tags the connector proposes; always imported as `suggested`, never as confirmed expertise. */
  suggestedTags?: { kind: 'skill' | 'interest' | 'org' | 'role'; tag: string; label: string; basis: string }[];
}

export interface ImportedEdge {
  kind: 'edge';
  fromProviderId: string | null; // null = the Bridge user
  toProviderId: string;
  edgeKind: 'follows' | 'followed_by' | 'knows' | 'works_with' | 'same_org' | 'same_school';
  confidence: number;
  provenance: FieldProvenance;
}

export type ImportedRecord = ImportedPerson | ImportedEdge;

export interface ConnectorResponse {
  ok: boolean;
  records?: ImportedRecord[];
  cursor?: Record<string, unknown>;
  stats?: Record<string, number>;
  warnings?: string[];
  error?: string;
}

export const PROTOCOL_VERSION = 1;
