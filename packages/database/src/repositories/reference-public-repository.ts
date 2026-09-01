import {
  publicProjectDomainAuthorityListQuerySchema,
  publicProjectDomainAuthorityListSchema,
  publicProjectDomainAuthoritySchema,
  publicProjectReferenceListQuerySchema,
  publicProjectReferencePageSchema,
  publicProjectReferenceSchema,
  type PublicProjectDomainAuthority,
  type PublicProjectReference,
} from '@airdrop/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../generated/database.types.js';

// These selections are the whole public contract. Adding a column here widens
// what anonymous readers receive, so it must be reviewed as a leak, not as a
// convenience. Candidate, flagged, and withdrawn rows, plus every reference
// under a blocked project, are filtered by the view itself; the repository
// never re-reads a base table to second-guess that decision.
const referenceSelection = 'reference_id,project_id,kind,label,url,last_verified_at';
const authoritySelection = 'authority_id,project_id,domain,granted_at';
const referenceRowKeys = [
  'kind',
  'label',
  'last_verified_at',
  'project_id',
  'reference_id',
  'url',
];
const authorityRowKeys = ['authority_id', 'domain', 'granted_at', 'project_id'];

export interface PublicReferenceListQuery {
  readonly projectId: string;
  readonly cursor: string | null;
  readonly limit?: number;
}

export interface PublicDomainAuthorityListQuery {
  readonly projectId: string;
  readonly limit?: number;
}

export interface PublicReferencePage {
  readonly version: 1;
  readonly items: readonly PublicProjectReference[];
  readonly nextCursor: string | null;
}

export interface PublicDomainAuthorityList {
  readonly version: 1;
  readonly items: readonly PublicProjectDomainAuthority[];
}

export interface ReferencePublicRepository {
  listVerifiedReferences(input: PublicReferenceListQuery): Promise<PublicReferencePage>;
  listGrantedDomainAuthorities(
    input: PublicDomainAuthorityListQuery,
  ): Promise<PublicDomainAuthorityList>;
}

export function createReferencePublicRepository(
  client: SupabaseClient<Database>,
): ReferencePublicRepository {
  return {
    async listVerifiedReferences(input) {
      const query = publicProjectReferenceListQuerySchema.parse(input);
      const cursor = query.cursor === null ? null : decodeReferenceCursor(query.cursor);
      const base = client
        .from('public_project_references')
        .select(referenceSelection)
        .eq('project_id', query.projectId)
        .order('last_verified_at', { ascending: false })
        .order('reference_id', { ascending: false });
      const response =
        cursor === null
          ? await base.range(0, query.limit)
          : await base
              .or(
                `last_verified_at.lt.${cursor.lastVerifiedAt},and(last_verified_at.eq.${cursor.lastVerifiedAt},reference_id.lt.${cursor.referenceId})`,
              )
              .range(0, query.limit);

      if (response.error !== null) {
        throw new ReferencePublicProjectionQueryError(response.error.code);
      }

      const rows = (response.data ?? []).map((row) => parseReferenceRow(row, query.projectId));
      const items = rows.slice(0, query.limit);
      const finalItem = items.at(-1);
      const page = publicProjectReferencePageSchema.parse({
        items,
        nextCursor:
          rows.length > query.limit && finalItem !== undefined
            ? encodeReferenceCursor(finalItem.lastVerifiedAt, finalItem.referenceId)
            : null,
      });
      return { version: 1, items: page.items, nextCursor: page.nextCursor };
    },

    async listGrantedDomainAuthorities(input) {
      const query = publicProjectDomainAuthorityListQuerySchema.parse(input);
      const response = await client
        .from('public_project_domain_authorities')
        .select(authoritySelection)
        .eq('project_id', query.projectId)
        .order('granted_at', { ascending: false })
        .order('authority_id', { ascending: false })
        .range(0, query.limit - 1);

      if (response.error !== null) {
        throw new ReferencePublicProjectionQueryError(response.error.code);
      }

      const items = (response.data ?? []).map((row) => parseAuthorityRow(row, query.projectId));
      return { version: 1, items: publicProjectDomainAuthorityListSchema.parse({ items }).items };
    },
  };
}

export class ReferencePublicProjectionQueryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super('Unable to read public project references.');
    this.name = 'ReferencePublicProjectionQueryError';
    this.code = code;
  }
}

function parseReferenceRow(value: unknown, projectId: string): PublicProjectReference {
  if (!isRecordWithExactKeys(value, referenceRowKeys)) {
    throw new TypeError('Public reference projection returned unsafe fields.');
  }
  if (value.project_id !== projectId) {
    throw new TypeError('Public reference projection returned a row outside the requested project.');
  }
  return publicProjectReferenceSchema.parse({
    projectId: value.project_id,
    referenceId: value.reference_id,
    kind: value.kind,
    label: value.label,
    url: value.url,
    lastVerifiedAt: value.last_verified_at,
  });
}

function parseAuthorityRow(value: unknown, projectId: string): PublicProjectDomainAuthority {
  if (!isRecordWithExactKeys(value, authorityRowKeys)) {
    throw new TypeError('Public domain authority projection returned unsafe fields.');
  }
  if (value.project_id !== projectId) {
    throw new TypeError(
      'Public domain authority projection returned a row outside the requested project.',
    );
  }
  return publicProjectDomainAuthoritySchema.parse({
    projectId: value.project_id,
    authorityId: value.authority_id,
    domain: value.domain,
    grantedAt: value.granted_at,
  });
}

function decodeReferenceCursor(
  value: string,
): { readonly lastVerifiedAt: string; readonly referenceId: string } {
  const decoded = decodeCursor(value);
  if (
    Object.keys(decoded).sort().join(',') !== 'lastVerifiedAt,referenceId'
    || typeof decoded.lastVerifiedAt !== 'string'
    || typeof decoded.referenceId !== 'string'
  ) {
    throw new RangeError('Public reference cursor is invalid.');
  }
  return { lastVerifiedAt: decoded.lastVerifiedAt, referenceId: decoded.referenceId };
}

function decodeCursor(value: string): Record<string, unknown> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const decoded = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(globalThis.atob(`${value}${padding}`), (character) =>
        character.charCodeAt(0),
      ),
    ),
  ) as unknown;
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new RangeError('Public reference cursor is invalid.');
  }
  return decoded as Record<string, unknown>;
}

function encodeReferenceCursor(lastVerifiedAt: string, referenceId: string): string {
  return globalThis
    .btoa(JSON.stringify({ lastVerifiedAt, referenceId }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function isRecordWithExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length
    && keys.every((key, index) => key === [...expectedKeys].sort()[index])
  );
}
