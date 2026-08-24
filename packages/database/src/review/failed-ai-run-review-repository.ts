import {
  failedAiRunDecisionCommandSchema,
  failedAiRunDecisionResultSchema,
  failedAiRunDetailSchema,
  failedAiRunListItemSchema,
  failedAiRunListQuerySchema,
  type FailedAiRunDecisionCommand,
  type FailedAiRunDecisionResult,
  type FailedAiRunDetail,
  type FailedAiRunListItem,
  type FailedAiRunListQuery,
} from '@airdrop/contracts';
import { createClient } from '@supabase/supabase-js';

import type { Database, Json } from '../generated/database.types.js';

export type FailedAiRunReviewRepositoryErrorCode =
  | 'reviewer_required'
  | 'review_run_not_found'
  | 'review_version_conflict'
  | 'review_idempotency_conflict'
  | 'invalid_review_command'
  | 'review_query_failed'
  | 'review_persistence_failed';

export class FailedAiRunReviewRepositoryError extends Error {
  readonly code: FailedAiRunReviewRepositoryErrorCode;

  constructor(code: FailedAiRunReviewRepositoryErrorCode) {
    super(code);
    this.name = 'FailedAiRunReviewRepositoryError';
    this.code = code;
  }
}

export type FailedAiRunReviewRpcCall = {
  readonly accessToken: string;
  readonly functionName:
    | 'list_failed_ai_runs'
    | 'get_failed_ai_run'
    | 'execute_failed_ai_run_review';
  readonly args: Readonly<Record<string, string | number | null>>;
};

export interface FailedAiRunReviewRpc {
  invoke(call: FailedAiRunReviewRpcCall): Promise<unknown>;
}

export interface FailedAiRunListResult {
  readonly version: 1;
  readonly items: readonly FailedAiRunListItem[];
  readonly nextCursor: string | null;
}

export interface FailedAiRunReviewRepository {
  list(input: {
    accessToken: string;
    query: FailedAiRunListQuery;
  }): Promise<FailedAiRunListResult>;
  get(input: { accessToken: string; runId: string }): Promise<FailedAiRunDetail>;
  decide(input: {
    accessToken: string;
    runId: string;
    idempotencyKey: string;
    command: FailedAiRunDecisionCommand;
  }): Promise<FailedAiRunDecisionResult>;
}

export interface FailedAiRunReviewRepositoryOptions {
  readonly url: string;
  readonly anonKey: string;
}

export function createFailedAiRunReviewRepository(
  options: FailedAiRunReviewRepositoryOptions,
): FailedAiRunReviewRepository {
  return createFailedAiRunReviewRepositoryFromRpc(createBearerScopedRpc(options));
}

export function createFailedAiRunReviewRepositoryFromRpc(
  rpc: FailedAiRunReviewRpc,
): FailedAiRunReviewRepository {
  return {
    list: async (input) => {
      try {
        const accessToken = parseAccessToken(input.accessToken);
        const query = failedAiRunListQuerySchema.parse(input.query);
        const cursor = query.cursor === null ? null : decodeCursor(query.cursor);
        const rows = parseRows(await rpc.invoke({
          accessToken,
          functionName: 'list_failed_ai_runs',
          args: {
            p_review_state: query.reviewState,
            p_status: query.status,
            p_cursor_created_at: cursor?.createdAt ?? null,
            p_cursor_id: cursor?.id ?? null,
            p_limit: query.limit + 1,
          },
        })).map((row) => failedAiRunListItemSchema.parse(row));
        const hasNextPage = rows.length > query.limit;
        const items = rows.slice(0, query.limit);
        const finalItem = items.at(-1);
        return {
          version: 1,
          items,
          nextCursor: hasNextPage && finalItem !== undefined
            ? encodeCursor(finalItem.createdAt, finalItem.runId)
            : null,
        };
      } catch (error) {
        throw mapRepositoryError(error, 'review_query_failed');
      }
    },
    get: async (input) => {
      try {
        const accessToken = parseAccessToken(input.accessToken);
        const runId = parseUuid(input.runId);
        const row = parseOneRow(await rpc.invoke({
          accessToken,
          functionName: 'get_failed_ai_run',
          args: { p_ai_run_id: runId },
        }));
        return failedAiRunDetailSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error, 'review_query_failed');
      }
    },
    decide: async (input) => {
      try {
        const accessToken = parseAccessToken(input.accessToken);
        const runId = parseUuid(input.runId);
        const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
        const command = parseDecisionCommand(input.command);
        const row = parseOneRow(await rpc.invoke({
          accessToken,
          functionName: 'execute_failed_ai_run_review',
          args: {
            p_ai_run_id: runId,
            p_command_payload: canonicalCommand(command),
            p_idempotency_key: idempotencyKey,
            p_now: new Date().toISOString(),
          },
        }));
        return failedAiRunDecisionResultSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error, 'review_persistence_failed');
      }
    },
  };
}

function createBearerScopedRpc(options: FailedAiRunReviewRepositoryOptions): FailedAiRunReviewRpc {
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
  call: FailedAiRunReviewRpcCall,
) {
  if (call.functionName === 'list_failed_ai_runs') {
    return client.rpc('list_failed_ai_runs', {
      p_review_state: requiredString(call.args, 'p_review_state'),
      p_status: requiredString(call.args, 'p_status'),
      p_cursor_created_at: optionalString(call.args, 'p_cursor_created_at') as string,
      p_cursor_id: optionalString(call.args, 'p_cursor_id') as string,
      p_limit: requiredNumber(call.args, 'p_limit'),
    });
  }
  if (call.functionName === 'get_failed_ai_run') {
    return client.rpc('get_failed_ai_run', {
      p_ai_run_id: requiredString(call.args, 'p_ai_run_id'),
    });
  }
  return client.rpc('execute_failed_ai_run_review', {
    p_ai_run_id: requiredString(call.args, 'p_ai_run_id'),
    p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
    p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
    p_now: requiredString(call.args, 'p_now'),
  });
}

function canonicalCommand(command: FailedAiRunDecisionCommand): string {
  return JSON.stringify({
    decision: command.decision,
    expectedReviewVersion: command.expectedReviewVersion,
    note: command.note,
    reasonCode: command.reasonCode,
    version: command.version,
  });
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

function decodeCursor(value: string): { readonly createdAt: string; readonly id: string } {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const decoded = JSON.parse(new TextDecoder().decode(
    Uint8Array.from(globalThis.atob(`${value}${padding}`), (character) => character.charCodeAt(0)),
  )) as unknown;
  if (!isRecord(decoded)
    || Object.keys(decoded).sort().join(',') !== 'createdAt,id'
    || typeof decoded.createdAt !== 'string'
    || typeof decoded.id !== 'string') {
    throw new Error('invalid_cursor');
  }
  return { createdAt: decoded.createdAt, id: decoded.id };
}

function encodeCursor(createdAt: string, id: string): string {
  return globalThis.btoa(JSON.stringify({ createdAt, id }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
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
    throw new FailedAiRunReviewRepositoryError('invalid_review_command');
  }
  return value;
}

function parseDecisionCommand(value: unknown): FailedAiRunDecisionCommand {
  const parsed = failedAiRunDecisionCommandSchema.safeParse(value);
  if (!parsed.success) {
    throw new FailedAiRunReviewRepositoryError('invalid_review_command');
  }
  return parsed.data;
}

function parseUuid(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error('invalid_uuid');
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

function mapRepositoryError(
  error: unknown,
  fallback: 'review_query_failed' | 'review_persistence_failed',
): FailedAiRunReviewRepositoryError {
  if (error instanceof FailedAiRunReviewRepositoryError) return error;
  const mapped = sqlStateErrorCode(error);
  return new FailedAiRunReviewRepositoryError(mapped ?? fallback);
}

function sqlStateErrorCode(error: unknown): FailedAiRunReviewRepositoryErrorCode | undefined {
  if (!isRecord(error) || typeof error.code !== 'string') return undefined;
  switch (error.code) {
    case 'AR101': return 'review_version_conflict';
    case 'AR102': return 'review_idempotency_conflict';
    case 'AR103': return 'review_run_not_found';
    case 'AR104': return 'reviewer_required';
    case 'AR105': return 'invalid_review_command';
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
  const value = requiredString(args, key);
  return JSON.parse(value) as Json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
