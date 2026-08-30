import {
  decideDomainAuthorityCommandV1Schema,
  decideReferenceCommandV1Schema,
  domainAuthorityCommandReceiptV1Schema,
  domainAuthorityReviewListQuerySchema,
  referenceCommandReceiptV1Schema,
  referenceReviewListQuerySchema,
  registerDomainAuthorityCommandV1Schema,
  registerReferenceCommandV1Schema,
  reviewerDomainAuthorityDetailSchema,
  reviewerDomainAuthorityListItemSchema,
  reviewerReferenceDetailSchema,
  reviewerReferenceListItemSchema,
  type DecideDomainAuthorityCommandV1,
  type DecideReferenceCommandV1,
  type DomainAuthorityCommandReceiptV1,
  type DomainAuthorityReviewListQuery,
  type ReferenceCommandReceiptV1,
  type ReferenceErrorCode,
  type ReferenceReviewListQuery,
  type RegisterDomainAuthorityCommandV1,
  type RegisterReferenceCommandV1,
  type ReviewerDomainAuthorityDetail,
  type ReviewerDomainAuthorityListItem,
  type ReviewerReferenceDetail,
  type ReviewerReferenceListItem,
} from '@airdrop/contracts';
import { createClient } from '@supabase/supabase-js';

import type { Database, Json } from '../generated/database.types.js';

const reviewerListMaximumLimit = 100;

export type ReferenceReviewRepositoryErrorCode = ReferenceErrorCode;

export class ReferenceReviewRepositoryError extends Error {
  readonly code: ReferenceReviewRepositoryErrorCode;

  constructor(code: ReferenceReviewRepositoryErrorCode) {
    super(code);
    this.name = 'ReferenceReviewRepositoryError';
    this.code = code;
  }
}

export type ReferenceReviewRpcCall = {
  readonly accessToken: string;
  readonly functionName:
    | 'list_reference_review_items'
    | 'get_reference_review_detail'
    | 'list_domain_authority_review_items'
    | 'get_domain_authority_review_detail'
    | 'submit_register_reference'
    | 'submit_decide_reference'
    | 'submit_register_domain_authority'
    | 'submit_decide_domain_authority';
  readonly args: Readonly<Record<string, string | number | null>>;
};

export interface ReferenceReviewRpc {
  invoke(call: ReferenceReviewRpcCall): Promise<unknown>;
}

export interface ReferenceReviewListResult {
  readonly version: 1;
  readonly items: readonly ReviewerReferenceListItem[];
  readonly nextCursor: string | null;
}

export interface DomainAuthorityReviewListResult {
  readonly version: 1;
  readonly items: readonly ReviewerDomainAuthorityListItem[];
  readonly nextCursor: string | null;
}

export interface ReferenceReviewRepository {
  listReferences(input: {
    accessToken: string;
    query: ReferenceReviewListQuery;
  }): Promise<ReferenceReviewListResult>;
  getReference(input: {
    accessToken: string;
    referenceId: string;
  }): Promise<ReviewerReferenceDetail>;
  registerReference(input: {
    accessToken: string;
    idempotencyKey: string;
    command: RegisterReferenceCommandV1;
  }): Promise<ReferenceCommandReceiptV1>;
  decideReference(input: {
    accessToken: string;
    referenceId: string;
    idempotencyKey: string;
    command: DecideReferenceCommandV1;
  }): Promise<ReferenceCommandReceiptV1>;
  listDomainAuthorities(input: {
    accessToken: string;
    query: DomainAuthorityReviewListQuery;
  }): Promise<DomainAuthorityReviewListResult>;
  getDomainAuthority(input: {
    accessToken: string;
    authorityId: string;
  }): Promise<ReviewerDomainAuthorityDetail>;
  registerDomainAuthority(input: {
    accessToken: string;
    idempotencyKey: string;
    command: RegisterDomainAuthorityCommandV1;
  }): Promise<DomainAuthorityCommandReceiptV1>;
  decideDomainAuthority(input: {
    accessToken: string;
    authorityId: string;
    idempotencyKey: string;
    command: DecideDomainAuthorityCommandV1;
  }): Promise<DomainAuthorityCommandReceiptV1>;
}

export interface ReferenceReviewRepositoryOptions {
  readonly url: string;
  readonly anonKey: string;
}

export function createReferenceReviewRepository(
  options: ReferenceReviewRepositoryOptions,
): ReferenceReviewRepository {
  return createReferenceReviewRepositoryFromRpc(createBearerScopedRpc(options));
}

export function createReferenceReviewRepositoryFromRpc(
  rpc: ReferenceReviewRpc,
): ReferenceReviewRepository {
  return {
    listReferences: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const query = referenceReviewListQuerySchema.parse(input.query);
        const cursor = query.cursor === null ? null : decodeReferenceCursor(query.cursor);
        const rows = parseRows(await rpc.invoke({
          accessToken: token,
          functionName: 'list_reference_review_items',
          args: {
            p_project_id: query.projectId,
            p_state: query.state,
            p_cursor_updated_at: cursor?.updatedAt ?? null,
            p_cursor_id: cursor?.referenceId ?? null,
            p_limit: Math.min(query.limit + 1, reviewerListMaximumLimit),
          },
        })).map((row) => reviewerReferenceListItemSchema.parse(row));
        return pageOf(rows, query.limit, (item) => encodeCursor({
          updatedAt: item.updatedAt,
          referenceId: item.referenceId,
        }));
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    getReference: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const id = parseUuid(input.referenceId);
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'get_reference_review_detail',
          args: { p_reference_id: id },
        }));
        return reviewerReferenceDetailSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    registerReference: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const key = parseIdempotencyKey(input.idempotencyKey);
        const parsed = registerReferenceCommandV1Schema.safeParse(input.command);
        if (!parsed.success) throw commandInvalid();
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'submit_register_reference',
          args: {
            p_command_payload: canonicalJson(parsed.data),
            p_idempotency_key: key,
          },
        }));
        return referenceCommandReceiptV1Schema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    decideReference: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const id = parseUuid(input.referenceId);
        const key = parseIdempotencyKey(input.idempotencyKey);
        const parsed = decideReferenceCommandV1Schema.safeParse(input.command);
        if (!parsed.success || parsed.data.referenceId !== id) throw commandInvalid();
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'submit_decide_reference',
          args: {
            p_reference_id: id,
            p_command_payload: canonicalJson(parsed.data),
            p_idempotency_key: key,
          },
        }));
        return referenceCommandReceiptV1Schema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    listDomainAuthorities: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const query = domainAuthorityReviewListQuerySchema.parse(input.query);
        const cursor = query.cursor === null ? null : decodeAuthorityCursor(query.cursor);
        const rows = parseRows(await rpc.invoke({
          accessToken: token,
          functionName: 'list_domain_authority_review_items',
          args: {
            p_project_id: query.projectId,
            p_state: query.state,
            p_cursor_updated_at: cursor?.updatedAt ?? null,
            p_cursor_id: cursor?.authorityId ?? null,
            p_limit: Math.min(query.limit + 1, reviewerListMaximumLimit),
          },
        })).map((row) => reviewerDomainAuthorityListItemSchema.parse(row));
        return pageOf(rows, query.limit, (item) => encodeCursor({
          updatedAt: item.updatedAt,
          authorityId: item.authorityId,
        }));
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    getDomainAuthority: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const id = parseUuid(input.authorityId);
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'get_domain_authority_review_detail',
          args: { p_authority_id: id },
        }));
        return reviewerDomainAuthorityDetailSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    registerDomainAuthority: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const key = parseIdempotencyKey(input.idempotencyKey);
        const parsed = registerDomainAuthorityCommandV1Schema.safeParse(input.command);
        if (!parsed.success) throw commandInvalid();
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'submit_register_domain_authority',
          args: {
            p_command_payload: canonicalJson(parsed.data),
            p_idempotency_key: key,
          },
        }));
        return domainAuthorityCommandReceiptV1Schema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    decideDomainAuthority: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const id = parseUuid(input.authorityId);
        const key = parseIdempotencyKey(input.idempotencyKey);
        const parsed = decideDomainAuthorityCommandV1Schema.safeParse(input.command);
        if (!parsed.success || parsed.data.authorityId !== id) throw commandInvalid();
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'submit_decide_domain_authority',
          args: {
            p_authority_id: id,
            p_command_payload: canonicalJson(parsed.data),
            p_idempotency_key: key,
          },
        }));
        return domainAuthorityCommandReceiptV1Schema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
  };
}

function createBearerScopedRpc(options: ReferenceReviewRepositoryOptions): ReferenceReviewRpc {
  return {
    invoke: async (call) => {
      const client = createClient<Database>(options.url, options.anonKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        global: { headers: { Authorization: `Bearer ${call.accessToken}` } },
      });
      const response = await invokeSupabaseRpc(client, call);
      if (response.error !== null) throw response.error;
      return response.data;
    },
  };
}

async function invokeSupabaseRpc(
  client: ReturnType<typeof createClient<Database>>,
  call: ReferenceReviewRpcCall,
) {
  switch (call.functionName) {
    case 'list_reference_review_items':
      return client.rpc('list_reference_review_items', {
        p_project_id: optionalString(call.args, 'p_project_id') as string,
        p_state: requiredString(call.args, 'p_state'),
        p_cursor_updated_at: optionalString(call.args, 'p_cursor_updated_at') as string,
        p_cursor_id: optionalString(call.args, 'p_cursor_id') as string,
        p_limit: requiredNumber(call.args, 'p_limit'),
      });
    case 'get_reference_review_detail':
      return client.rpc('get_reference_review_detail', {
        p_reference_id: requiredString(call.args, 'p_reference_id'),
      });
    case 'list_domain_authority_review_items':
      return client.rpc('list_domain_authority_review_items', {
        p_project_id: optionalString(call.args, 'p_project_id') as string,
        p_state: requiredString(call.args, 'p_state'),
        p_cursor_updated_at: optionalString(call.args, 'p_cursor_updated_at') as string,
        p_cursor_id: optionalString(call.args, 'p_cursor_id') as string,
        p_limit: requiredNumber(call.args, 'p_limit'),
      });
    case 'get_domain_authority_review_detail':
      return client.rpc('get_domain_authority_review_detail', {
        p_authority_id: requiredString(call.args, 'p_authority_id'),
      });
    case 'submit_register_reference':
      return client.rpc('submit_register_reference', {
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
    case 'submit_decide_reference':
      return client.rpc('submit_decide_reference', {
        p_reference_id: requiredString(call.args, 'p_reference_id'),
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
    case 'submit_register_domain_authority':
      return client.rpc('submit_register_domain_authority', {
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
    case 'submit_decide_domain_authority':
      return client.rpc('submit_decide_domain_authority', {
        p_authority_id: requiredString(call.args, 'p_authority_id'),
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
  }
}

function pageOf<Item>(
  rows: readonly Item[],
  limit: number,
  encodeNextCursor: (finalItem: Item) => string,
): { version: 1; items: readonly Item[]; nextCursor: string | null } {
  const hasNextPage = rows.length > limit
    || (limit === reviewerListMaximumLimit && rows.length === limit);
  const items = rows.slice(0, limit);
  const finalItem = items.at(-1);
  return {
    version: 1,
    items,
    nextCursor: hasNextPage && finalItem !== undefined ? encodeNextCursor(finalItem) : null,
  };
}

function decodeReferenceCursor(value: string): { updatedAt: string; referenceId: string } {
  const decoded = decodeCursor(value);
  if (Object.keys(decoded).sort().join(',') !== 'referenceId,updatedAt'
    || typeof decoded.updatedAt !== 'string'
    || typeof decoded.referenceId !== 'string') {
    throw new Error('invalid_cursor');
  }
  return { updatedAt: decoded.updatedAt, referenceId: decoded.referenceId };
}

function decodeAuthorityCursor(value: string): { updatedAt: string; authorityId: string } {
  const decoded = decodeCursor(value);
  if (Object.keys(decoded).sort().join(',') !== 'authorityId,updatedAt'
    || typeof decoded.updatedAt !== 'string'
    || typeof decoded.authorityId !== 'string') {
    throw new Error('invalid_cursor');
  }
  return { updatedAt: decoded.updatedAt, authorityId: decoded.authorityId };
}

function decodeCursor(value: string): Record<string, unknown> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const decoded = JSON.parse(new TextDecoder().decode(
    Uint8Array.from(globalThis.atob(`${value}${padding}`), (character) => character.charCodeAt(0)),
  )) as unknown;
  if (!isRecord(decoded)) throw new Error('invalid_cursor');
  return decoded;
}

function encodeCursor(value: Readonly<Record<string, string>>): string {
  return globalThis.btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function parseRows(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('invalid_result');
  return value;
}

function parseOneRow(value: unknown): unknown {
  const rows = parseRows(value);
  if (rows.length !== 1) throw new Error('invalid_result');
  return rows[0];
}

function parseAccessToken(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim().length === 0) {
    throw new Error('invalid_access_token');
  }
  return value;
}

function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string'
    || value !== value.trim()
    || Array.from(value).length < 1
    || Array.from(value).length > 255
    || !isPostgresText(value)) {
    throw commandInvalid();
  }
  return value;
}

function parseUuid(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw commandInvalid();
  }
  return value;
}

function isPostgresText(value: string): boolean {
  if (value.includes('\u0000')) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function commandInvalid(): ReferenceReviewRepositoryError {
  return new ReferenceReviewRepositoryError('reference_command_invalid');
}

function mapRepositoryError(error: unknown): ReferenceReviewRepositoryError {
  if (error instanceof ReferenceReviewRepositoryError) return error;
  return new ReferenceReviewRepositoryError(
    sqlStateErrorCode(error) ?? 'reference_persistence_failed',
  );
}

function sqlStateErrorCode(error: unknown): ReferenceReviewRepositoryErrorCode | undefined {
  if (!isRecord(error) || typeof error.code !== 'string') return undefined;
  switch (error.code) {
    case 'AR201': return 'reference_not_found';
    case 'AR202': return 'reference_not_decidable';
    case 'AR203': return 'domain_authority_not_found';
    case 'AR204': return 'reference_reviewer_required';
    case 'AR206': return 'reference_version_conflict';
    case 'AR207': return 'reference_idempotency_conflict';
    case 'AR208': return 'reference_command_invalid';
    case 'AR209': return 'reference_evidence_required';
    case 'AR210': return 'reference_normalization_invalid';
    case 'AR299': return 'reference_persistence_failed';
    default: return undefined;
  }
}

function requiredString(
  args: Readonly<Record<string, string | number | null>>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== 'string') throw new Error('invalid_rpc_argument');
  return value;
}

function optionalString(
  args: Readonly<Record<string, string | number | null>>,
  key: string,
): string | null {
  const value = args[key];
  if (value === null || typeof value === 'string') return value;
  throw new Error('invalid_rpc_argument');
}

function requiredNumber(
  args: Readonly<Record<string, string | number | null>>,
  key: string,
): number {
  const value = args[key];
  if (typeof value !== 'number') throw new Error('invalid_rpc_argument');
  return value;
}

function parseJsonArgument(
  args: Readonly<Record<string, string | number | null>>,
  key: string,
): Json {
  return JSON.parse(requiredString(args, key)) as Json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
