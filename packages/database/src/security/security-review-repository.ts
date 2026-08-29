import {
  manualSecurityCandidateCommandV1Schema,
  reviewerSecurityCandidateDetailSchema,
  reviewerSecurityCandidateListItemSchema,
  reviewerSecurityIncidentDetailSchema,
  reviewerSecurityIncidentListItemSchema,
  securityCandidateListQuerySchema,
  securityCandidateReviewCommandV1Schema,
  securityCandidateReviewReceiptV1Schema,
  securityCandidateStateSchema,
  securityIncidentCommandReceiptV1Schema,
  securityIncidentCommandV1Schema,
  securityIncidentListQuerySchema,
  securityIndicatorDisclosureCommandV1Schema,
  securityIndicatorDisclosureReceiptV1Schema,
  type ManualSecurityCandidateCommandV1,
  type ReviewerSecurityCandidateDetail,
  type ReviewerSecurityCandidateListItem,
  type ReviewerSecurityIncidentDetail,
  type ReviewerSecurityIncidentListItem,
  type SecurityCandidateListQuery,
  type SecurityCandidateReviewCommandV1,
  type SecurityCandidateReviewReceiptV1,
  type SecurityErrorCode,
  type SecurityIncidentCommandReceiptV1,
  type SecurityIncidentCommandV1,
  type SecurityIncidentListQuery,
  type SecurityIndicatorDisclosureCommandV1,
  type SecurityIndicatorDisclosureReceiptV1,
} from '@airdrop/contracts';
import { createClient } from '@supabase/supabase-js';

import type { Database, Json } from '../generated/database.types.js';

export type SecurityReviewRepositoryErrorCode = SecurityErrorCode;

export class SecurityReviewRepositoryError extends Error {
  readonly code: SecurityReviewRepositoryErrorCode;

  constructor(code: SecurityReviewRepositoryErrorCode) {
    super(code);
    this.name = 'SecurityReviewRepositoryError';
    this.code = code;
  }
}

export type SecurityReviewRpcCall = {
  readonly accessToken: string;
  readonly functionName:
    | 'list_security_candidates'
    | 'get_security_candidate'
    | 'list_security_incidents'
    | 'get_security_incident'
    | 'submit_manual_security_candidate'
    | 'execute_security_candidate_review'
    | 'open_security_incident'
    | 'execute_security_incident_command'
    | 'set_security_indicator_disclosure';
  readonly args: Readonly<Record<string, string | number | null>>;
};

export interface SecurityReviewRpc {
  invoke(call: SecurityReviewRpcCall): Promise<unknown>;
}

export interface SecurityManualSubmissionReceipt {
  readonly version: 1;
  readonly commandId: string;
  readonly candidateId: string;
  readonly candidateVersion: number;
  readonly state: string;
  readonly replayed: boolean;
}

export type SecurityCandidateCommandResult =
  | SecurityManualSubmissionReceipt
  | SecurityCandidateReviewReceiptV1;

export interface SecurityCandidateListResult {
  readonly version: 1;
  readonly items: readonly ReviewerSecurityCandidateListItem[];
  readonly nextCursor: string | null;
}

export interface SecurityIncidentListResult {
  readonly version: 1;
  readonly items: readonly ReviewerSecurityIncidentListItem[];
  readonly nextCursor: string | null;
}

export interface SecurityReviewRepository {
  listCandidates(input: { accessToken: string; query: SecurityCandidateListQuery }): Promise<SecurityCandidateListResult>;
  getCandidate(input: { accessToken: string; candidateId: string }): Promise<ReviewerSecurityCandidateDetail>;
  submitManualCandidate(input: {
    accessToken: string;
    idempotencyKey: string;
    command: ManualSecurityCandidateCommandV1;
  }): Promise<SecurityCandidateCommandResult>;
  reviewCandidate(input: {
    accessToken: string;
    candidateId: string;
    idempotencyKey: string;
    command: SecurityCandidateReviewCommandV1;
  }): Promise<SecurityCandidateCommandResult>;
  listIncidents(input: { accessToken: string; query: SecurityIncidentListQuery }): Promise<SecurityIncidentListResult>;
  getIncident(input: { accessToken: string; incidentId: string }): Promise<ReviewerSecurityIncidentDetail>;
  openIncident(input: {
    accessToken: string;
    idempotencyKey: string;
    command: Extract<SecurityIncidentCommandV1, { action: 'open' }>;
  }): Promise<SecurityIncidentCommandReceiptV1>;
  commandIncident(input: {
    accessToken: string;
    incidentId: string;
    idempotencyKey: string;
    command: Exclude<SecurityIncidentCommandV1, { action: 'open' }>;
  }): Promise<SecurityIncidentCommandReceiptV1>;
  setIndicatorDisclosure(input: {
    accessToken: string;
    indicatorId: string;
    idempotencyKey: string;
    command: SecurityIndicatorDisclosureCommandV1;
  }): Promise<SecurityIndicatorDisclosureReceiptV1>;
}

export interface SecurityReviewRepositoryOptions {
  readonly url: string;
  readonly anonKey: string;
}

export function createSecurityReviewRepository(
  options: SecurityReviewRepositoryOptions,
): SecurityReviewRepository {
  return createSecurityReviewRepositoryFromRpc(createBearerScopedRpc(options));
}

export function createSecurityReviewRepositoryFromRpc(
  rpc: SecurityReviewRpc,
): SecurityReviewRepository {
  return {
    listCandidates: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const query = securityCandidateListQuerySchema.parse(input.query);
        const cursor = query.cursor === null ? null : decodeCursor(query.cursor);
        const rows = parseRows(await rpc.invoke({
          accessToken: token,
          functionName: 'list_security_candidates',
          args: {
            p_origin: query.origin,
            p_state: query.state,
            p_target_type: query.targetType,
            p_cursor_created_at: cursor?.createdAt ?? null,
            p_cursor_id: cursor?.id ?? null,
            // The ledger list RPCs accept 1..100; fetching one extra row only when
            // the requested page is below the bound keeps hasNextPage detection.
            p_limit: Math.min(query.limit + 1, 100),
          },
        })).map((row) => reviewerSecurityCandidateListItemSchema.parse(row));
        return pageOf(rows, query.limit, (item) => encodeCursor(item.createdAt, item.candidateId));
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    getCandidate: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const candidateId = parseUuid(input.candidateId);
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'get_security_candidate',
          args: { p_candidate_id: candidateId },
        }));
        return reviewerSecurityCandidateDetailSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    submitManualCandidate: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
        const command = manualSecurityCandidateCommandV1Schema.parse(input.command);
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'submit_manual_security_candidate',
          args: {
            p_command_payload: canonicalJson(command),
            p_idempotency_key: idempotencyKey,
          },
        }));
        return parseManualSubmissionReceipt(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    reviewCandidate: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const candidateId = parseUuid(input.candidateId);
        const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
        const command = securityCandidateReviewCommandV1Schema.parse(input.command);
        if (command.candidateId !== candidateId) {
          throw new SecurityReviewRepositoryError('security_command_invalid');
        }
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'execute_security_candidate_review',
          args: {
            p_candidate_id: candidateId,
            p_command_payload: canonicalJson(command),
            p_idempotency_key: idempotencyKey,
          },
        }));
        return securityCandidateReviewReceiptV1Schema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    listIncidents: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const query = securityIncidentListQuerySchema.parse(input.query);
        const cursor = query.cursor === null ? null : decodeCursor(query.cursor);
        const rows = parseRows(await rpc.invoke({
          accessToken: token,
          functionName: 'list_security_incidents',
          args: {
            p_state: query.state,
            p_target_type: query.targetType,
            p_cursor_created_at: cursor?.createdAt ?? null,
            p_cursor_id: cursor?.id ?? null,
            // The ledger list RPCs accept 1..100; fetching one extra row only when
            // the requested page is below the bound keeps hasNextPage detection.
            p_limit: Math.min(query.limit + 1, 100),
          },
        })).map((row) => reviewerSecurityIncidentListItemSchema.parse(row));
        return pageOf(rows, query.limit, (item) => encodeCursor(item.lastDecisionAt, item.incidentId));
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    getIncident: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const incidentId = parseUuid(input.incidentId);
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'get_security_incident',
          args: { p_incident_id: incidentId },
        }));
        return reviewerSecurityIncidentDetailSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    openIncident: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
        const command = securityIncidentCommandV1Schema.parse(input.command);
        if (command.action !== 'open') {
          throw new SecurityReviewRepositoryError('security_command_invalid');
        }
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'open_security_incident',
          args: {
            p_command_payload: canonicalJson(command),
            p_idempotency_key: idempotencyKey,
          },
        }));
        return securityIncidentCommandReceiptV1Schema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    commandIncident: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const incidentId = parseUuid(input.incidentId);
        const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
        const command = securityIncidentCommandV1Schema.parse(input.command);
        if (command.action === 'open' || !('incidentId' in command)) {
          throw new SecurityReviewRepositoryError('security_command_invalid');
        }
        if (command.incidentId !== incidentId) {
          throw new SecurityReviewRepositoryError('security_command_invalid');
        }
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'execute_security_incident_command',
          args: {
            p_incident_id: incidentId,
            p_command_payload: canonicalJson(command),
            p_idempotency_key: idempotencyKey,
          },
        }));
        return securityIncidentCommandReceiptV1Schema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    setIndicatorDisclosure: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const indicatorId = parseUuid(input.indicatorId);
        const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
        const command = securityIndicatorDisclosureCommandV1Schema.parse(input.command);
        if (command.indicatorId !== indicatorId) {
          throw new SecurityReviewRepositoryError('security_command_invalid');
        }
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'set_security_indicator_disclosure',
          args: {
            p_indicator_id: indicatorId,
            p_command_payload: canonicalJson(command),
            p_idempotency_key: idempotencyKey,
          },
        }));
        return securityIndicatorDisclosureReceiptV1Schema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
  };
}

function createBearerScopedRpc(options: SecurityReviewRepositoryOptions): SecurityReviewRpc {
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
  call: SecurityReviewRpcCall,
) {
  switch (call.functionName) {
    case 'list_security_candidates':
      return client.rpc('list_security_candidates', {
        p_origin: requiredString(call.args, 'p_origin'),
        p_state: requiredString(call.args, 'p_state'),
        p_target_type: requiredString(call.args, 'p_target_type'),
        p_cursor_created_at: optionalString(call.args, 'p_cursor_created_at') as string,
        p_cursor_id: optionalString(call.args, 'p_cursor_id') as string,
        p_limit: requiredNumber(call.args, 'p_limit'),
      });
    case 'get_security_candidate':
      return client.rpc('get_security_candidate', {
        p_candidate_id: requiredString(call.args, 'p_candidate_id'),
      });
    case 'list_security_incidents':
      return client.rpc('list_security_incidents', {
        p_state: requiredString(call.args, 'p_state'),
        p_target_type: requiredString(call.args, 'p_target_type'),
        p_cursor_created_at: optionalString(call.args, 'p_cursor_created_at') as string,
        p_cursor_id: optionalString(call.args, 'p_cursor_id') as string,
        p_limit: requiredNumber(call.args, 'p_limit'),
      });
    case 'get_security_incident':
      return client.rpc('get_security_incident', {
        p_incident_id: requiredString(call.args, 'p_incident_id'),
      });
    case 'submit_manual_security_candidate':
      return client.rpc('submit_manual_security_candidate', {
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
    case 'execute_security_candidate_review':
      return client.rpc('execute_security_candidate_review', {
        p_candidate_id: requiredString(call.args, 'p_candidate_id'),
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
    case 'open_security_incident':
      return client.rpc('open_security_incident', {
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
    case 'execute_security_incident_command':
      return client.rpc('execute_security_incident_command', {
        p_incident_id: requiredString(call.args, 'p_incident_id'),
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
    case 'set_security_indicator_disclosure':
      return client.rpc('set_security_indicator_disclosure', {
        p_indicator_id: requiredString(call.args, 'p_indicator_id'),
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
  const hasNextPage = rows.length > limit;
  const items = rows.slice(0, limit);
  const finalItem = items.at(-1);
  return {
    version: 1,
    items,
    nextCursor: hasNextPage && finalItem !== undefined ? encodeNextCursor(finalItem) : null,
  };
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

const manualSubmissionReceiptKeys = [
  'candidateId,candidateVersion,commandId,replayed,state,version',
];

function parseManualSubmissionReceipt(row: unknown): SecurityManualSubmissionReceipt {
  if (!isRecord(row)
    || Object.keys(row).sort().join(',') !== manualSubmissionReceiptKeys[0]
    || typeof row.version !== 'number' || row.version !== 1
    || typeof row.replayed !== 'boolean') {
    throw new Error('invalid_result');
  }
  const state = row.state;
  if (typeof state !== 'string' || !securityCandidateStateSchema.safeParse(state).success
    || typeof row.candidateId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(row.candidateId)
    || typeof row.commandId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(row.commandId)
    || typeof row.candidateVersion !== 'number'
    || !Number.isSafeInteger(row.candidateVersion)
    || row.candidateVersion < 1) {
    throw new Error('invalid_result');
  }
  return {
    version: 1,
    commandId: row.commandId,
    candidateId: row.candidateId,
    candidateVersion: row.candidateVersion,
    state,
    replayed: row.replayed,
  };
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
    throw new SecurityReviewRepositoryError('security_command_invalid');
  }
  return value;
}

function parseUuid(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new SecurityReviewRepositoryError('security_command_invalid');
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

function mapRepositoryError(error: unknown): SecurityReviewRepositoryError {
  if (error instanceof SecurityReviewRepositoryError) return error;
  const mapped = sqlStateErrorCode(error);
  return new SecurityReviewRepositoryError(mapped ?? 'security_persistence_failed');
}

function sqlStateErrorCode(error: unknown): SecurityReviewRepositoryErrorCode | undefined {
  if (!isRecord(error) || typeof error.code !== 'string') return undefined;
  switch (error.code) {
    case 'AS101': return 'security_candidate_not_found';
    case 'AS102': return 'security_candidate_not_reviewable';
    case 'AS103': return 'security_incident_not_found';
    case 'AS104': return 'security_reviewer_required';
    case 'AS105': return 'security_indicator_not_found';
    case 'AS106': return 'security_version_conflict';
    case 'AS107': return 'security_idempotency_conflict';
    case 'AS108': return 'security_command_invalid';
    case 'AS109': return 'security_target_mismatch';
    case 'AS111': return 'security_review_required';
    case 'AS112': return 'security_promotion_blocked';
    case 'AS199': return 'security_persistence_failed';
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
