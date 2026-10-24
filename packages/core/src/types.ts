export type ISODate = string;

/** Where a claim came from. `ai_suggested` and `extracted` claims are never treated as self-reported. */
export type SourceKind =
  | 'self_reported'
  | 'manual'
  | 'note'
  | 'csv_import'
  | 'phone_contacts'
  | 'plugin'
  | 'extracted'
  | 'ai_suggested'
  | 'demo';

export type ClaimStatus = 'confirmed' | 'suggested' | 'rejected';

export interface Evidence {
  sourceKind: SourceKind;
  /** Human-readable source, e.g. "Your note", "LinkedIn export (Connections.csv)". */
  sourceLabel: string;
  /** Optional pointer to the backing record (note id, import record id). */
  sourceRef?: string | null;
  recordedAt: ISODate;
  /** 0..1, how much the source supports the claim. */
  confidence: number;
  status: ClaimStatus;
  excerpt?: string | null;
}

export type TagKind = 'skill' | 'interest';

export interface TagClaim {
  /** Normalized canonical tag. */
  tag: string;
  kind: TagKind;
  evidence: Evidence;
}

/** How the owner relates to a contact. Followers are an audience, not a relationship. */
export type DirectRelationship =
  | 'personal'
  | 'colleague'
  | 'mutual_connection'
  | 'follower'
  | 'following'
  | 'unknown';

export interface ContactRecord {
  id: string;
  displayName: string;
  headline?: string | null;
  organizations: string[];
  school?: string | null;
  city?: string | null;
  howMet?: string | null;
  relationshipContext?: string | null;
  relationship: DirectRelationship;
  relationshipSource?: Evidence | null;
  lastInteractionAt?: ISODate | null;
  claims: TagClaim[];
  goals: TextClaim[];
  offers: TextClaim[];
  projects: TextClaim[];
  archived?: boolean;
  isDemo?: boolean;
}

export interface TextClaim {
  text: string;
  evidence: Evidence;
}

export type EdgeKind = 'knows' | 'works_with' | 'introduced' | 'follower' | 'following';

/** An explicitly recorded relationship between two of the owner's contacts. */
export interface ContactEdge {
  id: string;
  fromId: string;
  toId: string;
  kind: EdgeKind;
  status: 'confirmed' | 'unconfirmed';
  evidence: Evidence;
}

export interface OwnerProfile {
  id: string;
  displayName: string;
  skills: string[];
  interests: string[];
  goals: string[];
  offers: string[];
  lookingFor: string[];
}
