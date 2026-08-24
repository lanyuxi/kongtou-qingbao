import {
  apiErrorSchema,
  createApiSuccessSchema,
  failedAiRunDecisionCommandSchema,
  failedAiRunDecisionResultSchema,
  failedAiRunDetailSchema,
  failedAiRunListItemSchema,
  failedAiRunListQuerySchema,
  type FailedAiRunListQuery,
} from '@airdrop/contracts';
import type { FailedAiRunReviewRepository } from '@airdrop/database/failed-ai-run-review';
import { z } from 'zod';

import type { AuthenticatedUserVerifier } from './authenticated-user.js';

export type { AuthenticatedUserVerifier } from './authenticated-user.js';

const listDataSchema = z.strictObject({
  version: z.literal(1),
  items: z.array(failedAiRunListItemSchema),
});
const listResponseSchema = createApiSuccessSchema(listDataSchema);
const detailResponseSchema = createApiSuccessSchema(failedAiRunDetailSchema);
const decisionResponseSchema = createApiSuccessSchema(failedAiRunDecisionResultSchema);
const runIdSchema = z.string().uuid();
const allowedListQueryKeys = new Set(['reviewState', 'status', 'cursor', 'limit']);

type HandlerDependencies = {
  readonly auth: AuthenticatedUserVerifier;
  readonly reviews: FailedAiRunReviewRepository;
  readonly ids: { generate(): string };
};

type RunRouteContext = { readonly params: Promise<{ readonly runId: string }> };

export function createFailedAiRunListHandler(
  deps: HandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = deps.ids.generate();
    const accessToken = await authenticate(request, deps.auth).catch(() => undefined);
    if (accessToken === undefined) return errorResponse(500, 'review_query_failed', requestId);
    if (accessToken === null) return errorResponse(401, 'unauthorized', requestId);

    const parsedQuery = parseListQuery(new URL(request.url).searchParams);
    if (!parsedQuery.ok) return errorResponse(400, parsedQuery.code, requestId);

    try {
      const result = await deps.reviews.list({ accessToken, query: parsedQuery.query });
      return Response.json(listResponseSchema.parse({
        ok: true,
        data: { version: result.version, items: result.items },
        meta: { requestId, nextCursor: result.nextCursor },
      }));
    } catch (error) {
      return repositoryErrorResponse(error, requestId, 'review_query_failed');
    }
  };
}

export function createFailedAiRunDetailHandler(
  deps: HandlerDependencies,
): (request: Request, context: RunRouteContext) => Promise<Response> {
  return async (request, context) => {
    const requestId = deps.ids.generate();
    const accessToken = await authenticate(request, deps.auth).catch(() => undefined);
    if (accessToken === undefined) return errorResponse(500, 'review_query_failed', requestId);
    if (accessToken === null) return errorResponse(401, 'unauthorized', requestId);

    const parsedRunId = runIdSchema.safeParse((await context.params).runId);
    if (!parsedRunId.success) return errorResponse(400, 'invalid_request', requestId);

    try {
      const result = await deps.reviews.get({ accessToken, runId: parsedRunId.data });
      return Response.json(detailResponseSchema.parse({
        ok: true,
        data: result,
        meta: { requestId, nextCursor: null },
      }));
    } catch (error) {
      return repositoryErrorResponse(error, requestId, 'review_query_failed');
    }
  };
}

export function createFailedAiRunDecisionHandler(
  deps: HandlerDependencies,
): (request: Request, context: RunRouteContext) => Promise<Response> {
  return async (request, context) => {
    const requestId = deps.ids.generate();
    const accessToken = await authenticate(request, deps.auth).catch(() => undefined);
    if (accessToken === undefined) return errorResponse(500, 'review_persistence_failed', requestId);
    if (accessToken === null) return errorResponse(401, 'unauthorized', requestId);

    const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'));
    if (idempotencyKey === null) return errorResponse(400, 'invalid_request', requestId);

    const parsedRunId = runIdSchema.safeParse((await context.params).runId);
    if (!parsedRunId.success) return errorResponse(400, 'invalid_request', requestId);

    const command = await parseDecisionCommand(request);
    if (command === null) return errorResponse(400, 'invalid_request', requestId);

    try {
      const result = await deps.reviews.decide({
        accessToken,
        runId: parsedRunId.data,
        idempotencyKey,
        command,
      });
      return Response.json(decisionResponseSchema.parse({
        ok: true,
        data: result,
        meta: { requestId, nextCursor: null },
      }));
    } catch (error) {
      return repositoryErrorResponse(error, requestId, 'review_persistence_failed');
    }
  };
}

async function authenticate(
  request: Request,
  auth: AuthenticatedUserVerifier,
): Promise<string | null> {
  const authorization = request.headers.get('authorization');
  const user = await auth.verifyAuthorizationHeader(authorization);
  if (user === null) return null;
  return bearerToken(authorization);
}

function bearerToken(value: string | null): string | null {
  if (value === null) return null;
  return /^Bearer ([^\s]+)$/.exec(value)?.[1] ?? null;
}

function parseListQuery(searchParams: URLSearchParams):
  | { readonly ok: true; readonly query: FailedAiRunListQuery }
  | { readonly ok: false; readonly code: 'invalid_request' | 'invalid_cursor' } {
  for (const key of searchParams.keys()) {
    if (!allowedListQueryKeys.has(key) || searchParams.getAll(key).length !== 1) {
      return { ok: false, code: 'invalid_request' };
    }
  }

  const limitValue = searchParams.get('limit');
  if (limitValue !== null && !/^[1-9][0-9]*$/u.test(limitValue)) {
    return { ok: false, code: 'invalid_request' };
  }
  const cursor = searchParams.get('cursor');
  const withoutCursor = failedAiRunListQuerySchema.safeParse({
    reviewState: searchParams.get('reviewState') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    cursor: null,
    limit: limitValue === null ? undefined : Number(limitValue),
  });
  if (!withoutCursor.success) return { ok: false, code: 'invalid_request' };
  if (cursor === null) return { ok: true, query: withoutCursor.data };

  const withCursor = failedAiRunListQuerySchema.safeParse({ ...withoutCursor.data, cursor });
  return withCursor.success
    ? { ok: true, query: withCursor.data }
    : { ok: false, code: 'invalid_cursor' };
}

async function parseDecisionCommand(request: Request) {
  try {
    return failedAiRunDecisionCommandSchema.parse(await request.json());
  } catch {
    return null;
  }
}

function parseIdempotencyKey(value: string | null): string | null {
  if (value === null
    || value !== value.trim()
    || Array.from(value).length < 1
    || Array.from(value).length > 255
    || !isPostgresText(value)) {
    return null;
  }
  return value;
}

function repositoryErrorResponse(
  error: unknown,
  requestId: string,
  fallback: 'review_query_failed' | 'review_persistence_failed',
): Response {
  const code = errorCode(error);
  if (code === 'reviewer_required') return errorResponse(403, code, requestId);
  if (code === 'review_run_not_found') return errorResponse(404, code, requestId);
  if (code === 'review_version_conflict' || code === 'review_idempotency_conflict') {
    return errorResponse(409, code, requestId);
  }
  if (code === 'invalid_review_command') return errorResponse(400, 'invalid_request', requestId);
  return errorResponse(500, fallback, requestId);
}

function errorResponse(status: number, code: string, requestId: string): Response {
  return Response.json(apiErrorSchema.parse({
    ok: false,
    error: { code, message: messageFor(code), requestId, details: null },
  }), { status });
}

function messageFor(code: string): string {
  switch (code) {
    case 'unauthorized': return 'Authentication is required.';
    case 'invalid_request': return 'The request is invalid.';
    case 'invalid_cursor': return 'The cursor is invalid.';
    case 'reviewer_required': return 'Reviewer access is required.';
    case 'review_run_not_found': return 'The failed AI run was not found.';
    case 'review_version_conflict': return 'The review has changed.';
    case 'review_idempotency_conflict':
      return 'The idempotency key conflicts with a prior review command.';
    case 'review_query_failed': return 'Failed AI runs could not be loaded.';
    default: return 'The review decision could not be persisted.';
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
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
