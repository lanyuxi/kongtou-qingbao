import {
  acceptTutorialCandidateCommandV1Schema,
  apiErrorSchema,
  createApiSuccessSchema,
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
} from '@airdrop/contracts';
import type { TutorialReviewRepository } from '@airdrop/database/tutorial-review';
import { z } from 'zod';

import type { AuthenticatedUserVerifier } from './authenticated-user.js';
import {
  decodeTutorialCandidateCursor,
  decodeTutorialReviewCursor,
  encodeTutorialCandidateCursor,
  encodeTutorialReviewCursor,
} from './tutorial-cursor.js';

export type { AuthenticatedUserVerifier } from './authenticated-user.js';

export type TutorialReviewHandlerDependencies = {
  readonly auth: AuthenticatedUserVerifier;
  readonly reviews: TutorialReviewRepository;
  readonly ids: { generate(): string };
};

const uuidSchema = z.uuid();
const candidateListResponseSchema = createApiSuccessSchema(z.strictObject({
  version: z.literal(1),
  items: z.array(tutorialCandidateReviewListItemSchema),
}));
const candidateDetailResponseSchema = createApiSuccessSchema(tutorialCandidateReviewDetailSchema);
const tutorialListResponseSchema = createApiSuccessSchema(z.strictObject({
  version: z.literal(1),
  items: z.array(tutorialReviewListItemSchema),
}));
const tutorialDetailResponseSchema = createApiSuccessSchema(tutorialReviewDetailSchema);
const acceptResponseSchema = createApiSuccessSchema(tutorialAcceptReceiptSchema);
const rejectResponseSchema = createApiSuccessSchema(tutorialRejectReceiptSchema);
const publishResponseSchema = createApiSuccessSchema(tutorialPublishReceiptSchema);
const retireResponseSchema = createApiSuccessSchema(tutorialRetireReceiptSchema);

export function createTutorialCandidateListHandler(deps: TutorialReviewHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const token = await authenticate(request, deps.auth);
    if (token.failed) return errorResponse(500, 'tutorial_query_failed', requestId);
    if (token.value === null) return errorResponse(401, 'unauthorized', requestId);
    const query = parseListQuery(
      new URL(request.url).searchParams,
      ['status', 'cursor', 'limit'],
      tutorialCandidateReviewListQuerySchema,
      decodeTutorialCandidateCursor,
    );
    if (!query.ok) return errorResponse(400, query.code, requestId);
    try {
      const result = await deps.reviews.listCandidates({
        accessToken: token.value,
        query: query.value,
      });
      return Response.json(candidateListResponseSchema.parse({
        ok: true,
        data: { version: result.version, items: result.items },
        meta: {
          requestId,
          nextCursor: result.nextCursor === null
            ? null
            : encodeTutorialCandidateCursor(result.nextCursor),
        },
      }));
    } catch (error) {
      return repositoryError(error, requestId, 'tutorial_query_failed');
    }
  };
}

export function createTutorialCandidateDetailHandler(deps: TutorialReviewHandlerDependencies) {
  return detailHandler(
    deps,
    'candidateId',
    (token, id) => deps.reviews.getCandidate({ accessToken: token, candidateId: id }),
    candidateDetailResponseSchema,
  );
}

export function createTutorialListHandler(deps: TutorialReviewHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const token = await authenticate(request, deps.auth);
    if (token.failed) return errorResponse(500, 'tutorial_query_failed', requestId);
    if (token.value === null) return errorResponse(401, 'unauthorized', requestId);
    const query = parseListQuery(
      new URL(request.url).searchParams,
      ['status', 'cursor', 'limit'],
      tutorialReviewListQuerySchema,
      decodeTutorialReviewCursor,
    );
    if (!query.ok) return errorResponse(400, query.code, requestId);
    try {
      const result = await deps.reviews.listTutorials({
        accessToken: token.value,
        query: query.value,
      });
      return Response.json(tutorialListResponseSchema.parse({
        ok: true,
        data: { version: result.version, items: result.items },
        meta: {
          requestId,
          nextCursor: result.nextCursor === null
            ? null
            : encodeTutorialReviewCursor(result.nextCursor),
        },
      }));
    } catch (error) {
      return repositoryError(error, requestId, 'tutorial_query_failed');
    }
  };
}

export function createTutorialDetailHandler(deps: TutorialReviewHandlerDependencies) {
  return detailHandler(
    deps,
    'tutorialId',
    (token, id) => deps.reviews.getTutorial({ accessToken: token, tutorialId: id }),
    tutorialDetailResponseSchema,
  );
}

export function createTutorialAcceptHandler(deps: TutorialReviewHandlerDependencies) {
  return identifiedMutationHandler(
    deps,
    'candidateId',
    acceptTutorialCandidateCommandV1Schema,
    acceptResponseSchema,
    (command: AcceptTutorialCandidateCommandV1) => command.candidateId,
    (token, id, key, command: AcceptTutorialCandidateCommandV1) =>
      deps.reviews.acceptCandidate({
        accessToken: token,
        idempotencyKey: key,
        command,
      }),
  );
}

export function createTutorialRejectHandler(deps: TutorialReviewHandlerDependencies) {
  return identifiedMutationHandler(
    deps,
    'candidateId',
    rejectTutorialCandidateCommandV1Schema,
    rejectResponseSchema,
    (command: RejectTutorialCandidateCommandV1) => command.candidateId,
    (token, id, key, command: RejectTutorialCandidateCommandV1) =>
      deps.reviews.rejectCandidate({
        accessToken: token,
        idempotencyKey: key,
        command,
      }),
  );
}

export function createTutorialPublishHandler(deps: TutorialReviewHandlerDependencies) {
  return identifiedMutationHandler(
    deps,
    'tutorialId',
    publishTutorialVersionCommandV1Schema,
    publishResponseSchema,
    (command: PublishTutorialVersionCommandV1) => command.tutorialId,
    (token, id, key, command: PublishTutorialVersionCommandV1) =>
      deps.reviews.publishVersion({
        accessToken: token,
        idempotencyKey: key,
        command,
      }),
  );
}

export function createTutorialRetireHandler(deps: TutorialReviewHandlerDependencies) {
  return identifiedMutationHandler(
    deps,
    'tutorialId',
    retireTutorialCommandV1Schema,
    retireResponseSchema,
    (command: RetireTutorialCommandV1) => command.tutorialId,
    (token, id, key, command: RetireTutorialCommandV1) =>
      deps.reviews.retire({
        accessToken: token,
        idempotencyKey: key,
        command,
      }),
  );
}

type IdContext = { readonly params: Promise<Record<string, string>> };
type Authenticated = { readonly failed: true } | { readonly failed: false; readonly value: string | null };
type FailureCode = 'tutorial_query_failed' | 'tutorial_persistence_failed';

function detailHandler<T>(
  deps: TutorialReviewHandlerDependencies,
  key: string,
  get: (token: string, id: string) => Promise<T>,
  schema: z.ZodType,
) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate();
    const token = await authenticate(request, deps.auth);
    if (token.failed) return errorResponse(500, 'tutorial_query_failed', requestId);
    if (token.value === null) return errorResponse(401, 'unauthorized', requestId);
    const id = uuidSchema.safeParse((await context.params)[key]);
    if (!id.success) return errorResponse(400, 'invalid_request', requestId);
    try {
      return Response.json(schema.parse({
        ok: true,
        data: await get(token.value, id.data),
        meta: { requestId, nextCursor: null },
      }));
    } catch (error) {
      return repositoryError(error, requestId, 'tutorial_query_failed');
    }
  };
}

function identifiedMutationHandler<TCommand>(
  deps: TutorialReviewHandlerDependencies,
  key: string,
  commandSchema: z.ZodType<TCommand>,
  responseSchema: z.ZodType,
  commandId: (command: TCommand) => string,
  submit: (
    token: string,
    id: string,
    idempotencyKey: string,
    command: TCommand,
  ) => Promise<unknown>,
) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate();
    const token = await authenticate(request, deps.auth);
    if (token.failed) return errorResponse(500, 'tutorial_persistence_failed', requestId);
    if (token.value === null) return errorResponse(401, 'unauthorized', requestId);
    const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'));
    const id = uuidSchema.safeParse((await context.params)[key]);
    const command = await parseJson(request, commandSchema);
    if (idempotencyKey === null || !id.success || command === null) {
      return errorResponse(400, 'invalid_request', requestId);
    }
    if (commandId(command) !== id.data) return errorResponse(400, 'invalid_request', requestId);
    try {
      const result = await submit(token.value, id.data, idempotencyKey, command);
      return Response.json(responseSchema.parse({
        ok: true,
        data: result,
        meta: { requestId, nextCursor: null },
      }));
    } catch (error) {
      return repositoryError(error, requestId, 'tutorial_persistence_failed');
    }
  };
}

async function authenticate(
  request: Request,
  auth: AuthenticatedUserVerifier,
): Promise<Authenticated> {
  const header = request.headers.get('authorization');
  try {
    const user = await auth.verifyAuthorizationHeader(header);
    return { failed: false, value: user === null ? null : bearerToken(header) };
  } catch {
    return { failed: true };
  }
}

function bearerToken(value: string | null): string | null {
  if (value === null) return null;
  return /^Bearer ([^\s]+)$/.exec(value)?.[1] ?? null;
}

async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseIdempotencyKey(value: string | null): string | null {
  return value === null
    || value !== value.trim()
    || Array.from(value).length < 1
    || Array.from(value).length > 255
    || !isPostgresText(value)
    ? null
    : value;
}

function isPostgresText(value: string): boolean {
  if (value.includes('\u0000')) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function parseListQuery<T>(
  params: URLSearchParams,
  allowed: readonly string[],
  schema: z.ZodType<T>,
  decodeCursor: (value: string | undefined) => unknown | null | 'invalid',
): { ok: true; value: T } | { ok: false; code: 'invalid_request' | 'invalid_cursor' } {
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      return { ok: false, code: 'invalid_request' };
    }
  }
  const limit = params.get('limit');
  if (limit !== null && !/^[1-9][0-9]*$/u.test(limit)) {
    return { ok: false, code: 'invalid_request' };
  }
  const decodedCursor = decodeCursor(params.get('cursor') ?? undefined);
  if (decodedCursor === 'invalid') return { ok: false, code: 'invalid_cursor' };
  const query = schema.safeParse({
    ...Object.fromEntries(params.entries()),
    cursor: decodedCursor,
    limit: limit === null ? undefined : Number(limit),
  });
  return query.success
    ? { ok: true, value: query.data }
    : { ok: false, code: 'invalid_request' };
}

function repositoryError(error: unknown, requestId: string, fallback: FailureCode): Response {
  const code = errorCode(error);
  if (code === 'tutorial_reviewer_required') return errorResponse(403, code, requestId);
  if (code === 'tutorial_not_found') return errorResponse(404, code, requestId);
  if (code === 'tutorial_idempotency_conflict' || code === 'tutorial_version_conflict') {
    return errorResponse(409, code, requestId);
  }
  if (
    code === 'tutorial_not_decidable'
    || code === 'tutorial_command_invalid'
    || code === 'tutorial_reference_not_allowlisted'
    || code === 'tutorial_reference_not_renderable'
    || code === 'tutorial_steps_invalid'
  ) {
    return errorResponse(400, 'invalid_request', requestId);
  }
  return errorResponse(500, fallback, requestId);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function errorResponse(status: number, code: string, requestId: string): Response {
  return Response.json(
    apiErrorSchema.parse({
      ok: false,
      error: { code, message: messageFor(code), requestId, details: null },
    }),
    { status },
  );
}

function messageFor(code: string): string {
  switch (code) {
    case 'unauthorized':
      return 'Authentication is required.';
    case 'invalid_request':
      return 'The request is invalid.';
    case 'invalid_cursor':
      return 'The cursor is invalid.';
    case 'tutorial_reviewer_required':
      return 'Reviewer access is required.';
    case 'tutorial_not_found':
      return 'The requested tutorial was not found.';
    case 'tutorial_idempotency_conflict':
      return 'The idempotency key conflicts with a prior tutorial command.';
    case 'tutorial_query_failed':
      return 'Tutorial records could not be loaded.';
    default:
      return 'Tutorial review could not be completed.';
  }
}
