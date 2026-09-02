import {
  acceptTutorialCandidateCommandV1Schema,
  publishTutorialVersionCommandV1Schema,
  rejectTutorialCandidateCommandV1Schema,
  retireTutorialCommandV1Schema,
  tutorialAcceptReceiptSchema,
  tutorialCandidateReviewDetailSchema,
  tutorialCandidateReviewListItemSchema,
  tutorialCandidateReviewListQuerySchema,
  tutorialPublishReceiptSchema,
  tutorialRejectReceiptSchema,
  tutorialRetireReceiptSchema,
  tutorialReviewDetailSchema,
  tutorialReviewListItemSchema,
  tutorialReviewListQuerySchema,
  type AcceptTutorialCandidateCommandV1,
  type PublishTutorialVersionCommandV1,
  type RejectTutorialCandidateCommandV1,
  type RetireTutorialCommandV1,
  type TutorialCandidateCursor,
  type TutorialCandidateReviewDetail,
  type TutorialCandidateReviewListQuery,
  type TutorialCandidateReviewListItem,
  type TutorialErrorCode,
  type TutorialReviewCursor,
  type TutorialReviewDetail,
  type TutorialReviewListQuery,
  type TutorialReviewListItem,
} from '@airdrop/contracts';
import { createClient } from '@supabase/supabase-js';

import type { Database, Json } from '../generated/database.types.js';

const reviewerListMaximumLimit = 100;

export type TutorialReviewRepositoryErrorCode = TutorialErrorCode;

export class TutorialReviewRepositoryError extends Error {
  readonly code: TutorialReviewRepositoryErrorCode;

  constructor(code: TutorialReviewRepositoryErrorCode) {
    super(code);
    this.name = 'TutorialReviewRepositoryError';
    this.code = code;
  }
}

export type TutorialReviewRpcCall = {
  readonly accessToken: string;
  readonly functionName:
    | 'list_tutorial_review_candidates'
    | 'get_tutorial_review_candidate'
    | 'list_tutorial_review_items'
    | 'get_tutorial_review_detail'
    | 'submit_accept_tutorial_candidate'
    | 'submit_reject_tutorial_candidate'
    | 'submit_publish_tutorial_version'
    | 'submit_retire_tutorial';
  readonly args: Readonly<Record<string, string | number | null>>;
};

export interface TutorialReviewRpc {
  invoke(call: TutorialReviewRpcCall): Promise<unknown>;
}

export interface TutorialAcceptReceipt {
  readonly version: 1;
  readonly commandId: string;
  readonly candidateId: string;
  readonly tutorialId: string;
  readonly tutorialVersion: number;
  readonly replayed: boolean;
}

export interface TutorialRejectReceipt {
  readonly version: 1;
  readonly commandId: string;
  readonly candidateId: string;
  readonly replayed: boolean;
}

export interface TutorialPublishReceipt {
  readonly version: 1;
  readonly commandId: string;
  readonly tutorialId: string;
  readonly tutorialVersion: number;
  readonly replayed: boolean;
}

export interface TutorialRetireReceipt {
  readonly version: 1;
  readonly commandId: string;
  readonly tutorialId: string;
  readonly replayed: boolean;
}

export interface TutorialReviewRepository {
  listCandidates(input: {
    accessToken: string;
    query: TutorialCandidateReviewListQuery;
  }): Promise<{
    version: 1;
    items: readonly TutorialCandidateReviewListItem[];
    nextCursor: TutorialCandidateCursor | null;
  }>;
  getCandidate(input: {
    accessToken: string;
    candidateId: string;
  }): Promise<TutorialCandidateReviewDetail>;
  listTutorials(input: {
    accessToken: string;
    query: TutorialReviewListQuery;
  }): Promise<{
    version: 1;
    items: readonly TutorialReviewListItem[];
    nextCursor: TutorialReviewCursor | null;
  }>;
  getTutorial(input: {
    accessToken: string;
    tutorialId: string;
  }): Promise<TutorialReviewDetail>;
  acceptCandidate(input: {
    accessToken: string;
    idempotencyKey: string;
    command: AcceptTutorialCandidateCommandV1;
  }): Promise<TutorialAcceptReceipt>;
  rejectCandidate(input: {
    accessToken: string;
    idempotencyKey: string;
    command: RejectTutorialCandidateCommandV1;
  }): Promise<TutorialRejectReceipt>;
  publishVersion(input: {
    accessToken: string;
    idempotencyKey: string;
    command: PublishTutorialVersionCommandV1;
  }): Promise<TutorialPublishReceipt>;
  retire(input: {
    accessToken: string;
    idempotencyKey: string;
    command: RetireTutorialCommandV1;
  }): Promise<TutorialRetireReceipt>;
}

export interface TutorialReviewRepositoryOptions {
  readonly url: string;
  readonly anonKey: string;
}

const candidateListRowKeys = [
  'candidateId',
  'createdAt',
  'kind',
  'projectId',
  'status',
  'title',
];
const candidateDetailRowKeys = [
  'candidateId',
  'confidence',
  'createdAt',
  'kind',
  'payload',
  'projectId',
  'sourceSignalIds',
  'status',
  'summary',
  'title',
];
const tutorialListRowKeys = [
  'kind',
  'projectId',
  'status',
  'title',
  'tutorialId',
  'updatedAt',
  'version',
];
const tutorialDetailRowKeys = [
  'decisions',
  'kind',
  'lastVerifiedAt',
  'projectId',
  'statusEvents',
  'status',
  'stepLinks',
  'steps',
  'summary',
  'title',
  'tutorialId',
  'updatedAt',
  'version',
];

export function createTutorialReviewRepository(
  options: TutorialReviewRepositoryOptions,
): TutorialReviewRepository {
  return createTutorialReviewRepositoryFromRpc(createBearerScopedRpc(options));
}

export function createTutorialReviewRepositoryFromRpc(
  rpc: TutorialReviewRpc,
): TutorialReviewRepository {
  return {
    listCandidates: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const query = tutorialCandidateReviewListQuerySchema.parse(input.query);
        const rawRows = await rpc.invoke({
          accessToken: token,
          functionName: 'list_tutorial_review_candidates',
          args: {
            p_status: query.status,
            p_cursor_created: query.cursor?.createdAt ?? null,
            p_cursor_id: query.cursor?.candidateId ?? null,
            p_limit: Math.min(query.limit + 1, reviewerListMaximumLimit),
          },
        });
        const rows = parseRows(rawRows).map((row) => {
          assertExactKeys(row, candidateListRowKeys, 'candidate review list');
          return tutorialCandidateReviewListItemSchema.parse(row);
        });
        return pageOf(rows, query.limit, (item) => ({
          createdAt: item.createdAt,
          candidateId: item.candidateId,
        }));
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    getCandidate: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const id = parseUuid(input.candidateId);
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'get_tutorial_review_candidate',
          args: { p_candidate_id: id },
        }));
        assertExactKeys(row, candidateDetailRowKeys, 'candidate review detail');
        return tutorialCandidateReviewDetailSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    listTutorials: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const query = tutorialReviewListQuerySchema.parse(input.query);
        const rows = parseRows(await rpc.invoke({
          accessToken: token,
          functionName: 'list_tutorial_review_items',
          args: {
            p_status: query.status,
            p_cursor_updated: query.cursor?.updatedAt ?? null,
            p_cursor_id: query.cursor?.tutorialId ?? null,
            p_limit: Math.min(query.limit + 1, reviewerListMaximumLimit),
          },
        })).map((row) => {
          assertExactKeys(row, tutorialListRowKeys, 'tutorial review list');
          return tutorialReviewListItemSchema.parse(row);
        });
        return pageOf(rows, query.limit, (item) => ({
          updatedAt: item.updatedAt,
          tutorialId: item.tutorialId,
        }));
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    getTutorial: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const id = parseUuid(input.tutorialId);
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'get_tutorial_review_detail',
          args: { p_tutorial_id: id },
        }));
        assertExactKeys(row, tutorialDetailRowKeys, 'tutorial review detail');
        return parseTutorialDetailRow(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    acceptCandidate: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const key = parseIdempotencyKey(input.idempotencyKey);
        const parsed = acceptTutorialCandidateCommandV1Schema.safeParse(input.command);
        if (!parsed.success) throw commandInvalid();
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'submit_accept_tutorial_candidate',
          args: {
            p_command_payload: canonicalJson(parsed.data),
            p_idempotency_key: key,
          },
        }));
        assertExactKeys(row, ['commandId', 'candidateId', 'replayed', 'tutorialId', 'tutorialVersion', 'version'], 'accept receipt');
        return tutorialAcceptReceiptSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    rejectCandidate: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const key = parseIdempotencyKey(input.idempotencyKey);
        const parsed = rejectTutorialCandidateCommandV1Schema.safeParse(input.command);
        if (!parsed.success) throw commandInvalid();
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'submit_reject_tutorial_candidate',
          args: {
            p_command_payload: canonicalJson(parsed.data),
            p_idempotency_key: key,
          },
        }));
        assertExactKeys(row, ['commandId', 'candidateId', 'replayed', 'version'], 'reject receipt');
        return tutorialRejectReceiptSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    publishVersion: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const key = parseIdempotencyKey(input.idempotencyKey);
        const parsed = publishTutorialVersionCommandV1Schema.safeParse(input.command);
        if (!parsed.success) throw commandInvalid();
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'submit_publish_tutorial_version',
          args: {
            p_command_payload: canonicalJson(parsed.data),
            p_idempotency_key: key,
          },
        }));
        assertExactKeys(row, ['commandId', 'replayed', 'tutorialId', 'tutorialVersion', 'version'], 'publish receipt');
        return tutorialPublishReceiptSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
    retire: async (input) => {
      try {
        const token = parseAccessToken(input.accessToken);
        const key = parseIdempotencyKey(input.idempotencyKey);
        const parsed = retireTutorialCommandV1Schema.safeParse(input.command);
        if (!parsed.success) throw commandInvalid();
        const row = parseOneRow(await rpc.invoke({
          accessToken: token,
          functionName: 'submit_retire_tutorial',
          args: {
            p_command_payload: canonicalJson(parsed.data),
            p_idempotency_key: key,
          },
        }));
        assertExactKeys(row, ['commandId', 'replayed', 'tutorialId', 'version'], 'retire receipt');
        return tutorialRetireReceiptSchema.parse(row);
      } catch (error) {
        throw mapRepositoryError(error);
      }
    },
  };
}

// The review detail RPC returns the stored step payload plus a flat, ordinal
// ordered link list resolved against the reference ledger. Folding them here
// keeps the ledger-resolved shape out of the projection while letting the
// reviewer UI read one nested document.
function parseTutorialDetailRow(row: unknown): TutorialReviewDetail {
  if (!isRecord(row)) {
    throw new TypeError('Tutorial review detail returned an invalid row.');
  }
  const steps = row.steps;
  const stepLinks = row.stepLinks;
  const decisions = row.decisions;
  const statusEvents = row.statusEvents;

  if (!Array.isArray(steps)) {
    throw new TypeError('Tutorial review detail returned an invalid steps payload.');
  }
  const links = stepLinks === null
    ? []
    : Array.isArray(stepLinks)
      ? stepLinks
      : undefined;
  if (links === undefined) {
    throw new TypeError('Tutorial review detail returned an invalid step link payload.');
  }
  const decisionHistory = decisions === null
    ? []
    : Array.isArray(decisions)
      ? decisions
      : undefined;
  if (decisionHistory === undefined) {
    throw new TypeError('Tutorial review detail returned an invalid decision payload.');
  }
  const events = statusEvents === null
    ? []
    : Array.isArray(statusEvents)
      ? statusEvents
      : undefined;
  if (events === undefined) {
    throw new TypeError('Tutorial review detail returned an invalid status event payload.');
  }

  const foldedSteps = steps.map((step, index) => {
    const ordinal = index + 1;
    const stepLinksForStep = links
      .filter((link): link is Record<string, unknown> => {
        if (!isRecord(link)) {
          throw new TypeError('Tutorial review detail returned an invalid step link.');
        }
        return link.ordinal === ordinal;
      })
      .map((link) => ({
        referenceId: link.referenceId,
        referenceLabel: link.referenceLabel,
        renderable: link.renderable,
        lastVerifiedAt: link.lastVerifiedAt,
      }));
    if (!isRecord(step)) {
      throw new TypeError('Tutorial review detail returned an invalid step.');
    }
    return { ordinal, title: step.title, body: step.body, links: stepLinksForStep };
  });

  return tutorialReviewDetailSchema.parse({
    tutorialId: row.tutorialId,
    projectId: row.projectId,
    kind: row.kind,
    status: row.status,
    version: row.version,
    title: row.title,
    summary: row.summary,
    lastVerifiedAt: row.lastVerifiedAt,
    updatedAt: row.updatedAt,
    steps: foldedSteps,
    decisions: decisionHistory,
    statusEvents: events,
  });
}

function createBearerScopedRpc(options: TutorialReviewRepositoryOptions): TutorialReviewRpc {
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
  call: TutorialReviewRpcCall,
) {
  switch (call.functionName) {
    case 'list_tutorial_review_candidates':
      return client.rpc('list_tutorial_review_candidates', {
        p_status: requiredString(call.args, 'p_status'),
        p_cursor_created: optionalString(call.args, 'p_cursor_created') as string,
        p_cursor_id: optionalString(call.args, 'p_cursor_id') as string,
        p_limit: requiredNumber(call.args, 'p_limit'),
      });
    case 'get_tutorial_review_candidate':
      return client.rpc('get_tutorial_review_candidate', {
        p_candidate_id: requiredString(call.args, 'p_candidate_id'),
      });
    case 'list_tutorial_review_items':
      return client.rpc('list_tutorial_review_items', {
        p_status: requiredString(call.args, 'p_status'),
        p_cursor_updated: optionalString(call.args, 'p_cursor_updated') as string,
        p_cursor_id: optionalString(call.args, 'p_cursor_id') as string,
        p_limit: requiredNumber(call.args, 'p_limit'),
      });
    case 'get_tutorial_review_detail':
      return client.rpc('get_tutorial_review_detail', {
        p_tutorial_id: requiredString(call.args, 'p_tutorial_id'),
      });
    case 'submit_accept_tutorial_candidate':
      return client.rpc('submit_accept_tutorial_candidate', {
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
    case 'submit_reject_tutorial_candidate':
      return client.rpc('submit_reject_tutorial_candidate', {
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
    case 'submit_publish_tutorial_version':
      return client.rpc('submit_publish_tutorial_version', {
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
    case 'submit_retire_tutorial':
      return client.rpc('submit_retire_tutorial', {
        p_command_payload: parseJsonArgument(call.args, 'p_command_payload'),
        p_idempotency_key: requiredString(call.args, 'p_idempotency_key'),
      });
  }
}

function pageOf<Item, Cursor>(
  rows: readonly Item[],
  limit: number,
  encodeNextCursor: (finalItem: Item) => Cursor,
): { version: 1; items: readonly Item[]; nextCursor: Cursor | null } {
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

function assertExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
  source: string,
): void {
  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    throw new TypeError(`Tutorial ${source} returned unsafe fields.`);
  }
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sorted = [...expectedKeys].sort();
  return keys.length === sorted.length && keys.every((key, index) => key === sorted[index]);
}

function commandInvalid(): TutorialReviewRepositoryError {
  return new TutorialReviewRepositoryError('tutorial_command_invalid');
}

function mapRepositoryError(error: unknown): TutorialReviewRepositoryError {
  if (error instanceof TutorialReviewRepositoryError) return error;
  return new TutorialReviewRepositoryError(
    sqlStateErrorCode(error) ?? 'tutorial_persistence_failed',
  );
}

function sqlStateErrorCode(error: unknown): TutorialReviewRepositoryErrorCode | undefined {
  if (!isRecord(error) || typeof error.code !== 'string') return undefined;
  switch (error.code) {
    case 'AT201': return 'tutorial_reviewer_required';
    case 'AT202': return 'tutorial_not_found';
    case 'AT203': return 'tutorial_not_decidable';
    case 'AT207': return 'tutorial_idempotency_conflict';
    case 'AT208': return 'tutorial_command_invalid';
    case 'AT210': return 'tutorial_reference_not_renderable';
    case 'AT211': return 'tutorial_steps_invalid';
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
