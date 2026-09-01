import {
  apiErrorSchema,
  createApiSuccessSchema,
  decideDomainAuthorityCommandV1Schema,
  decideReferenceCommandV1Schema,
  domainAuthorityCommandReceiptV1Schema,
  domainAuthorityReviewListQuerySchema,
  publicProjectReferenceListQuerySchema,
  publicProjectReferencePageSchema,
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
  type PublicProjectReferenceListQuery,
  type RegisterDomainAuthorityCommandV1,
  type RegisterReferenceCommandV1,
} from '@airdrop/contracts';
import type { ReferencePublicRepository } from '@airdrop/database';
import type { ReferenceReviewRepository } from '@airdrop/database/reference-review';
import { z } from 'zod';

import type { AuthenticatedUserVerifier } from './authenticated-user.js';

export type { AuthenticatedUserVerifier } from './authenticated-user.js';

export type ReferenceReviewHandlerDependencies = {
  readonly auth: AuthenticatedUserVerifier;
  readonly reviews: ReferenceReviewRepository;
  readonly publicReferences: ReferencePublicRepository;
  readonly ids: { generate(): string };
};

const uuidSchema = z.uuid();
const referenceListResponseSchema = createApiSuccessSchema(z.strictObject({
  version: z.literal(1),
  items: z.array(reviewerReferenceListItemSchema),
}));
const authorityListResponseSchema = createApiSuccessSchema(z.strictObject({
  version: z.literal(1),
  items: z.array(reviewerDomainAuthorityListItemSchema),
}));
const referenceDetailResponseSchema = createApiSuccessSchema(reviewerReferenceDetailSchema);
const authorityDetailResponseSchema = createApiSuccessSchema(reviewerDomainAuthorityDetailSchema);
const referenceMutationResponseSchema = createApiSuccessSchema(referenceCommandReceiptV1Schema);
const authorityMutationResponseSchema = createApiSuccessSchema(
  domainAuthorityCommandReceiptV1Schema,
);
const publicReferencesResponseSchema = createApiSuccessSchema(publicProjectReferencePageSchema);

export function createReferenceListHandler(deps: ReferenceReviewHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const token = await authenticate(request, deps.auth);
    if (token.failed) return errorResponse(500, 'reference_query_failed', requestId);
    if (token.value === null) return errorResponse(401, 'unauthorized', requestId);
    const query = parseQuery(
      new URL(request.url).searchParams,
      ['projectId', 'state', 'cursor', 'limit'],
      referenceReviewListQuerySchema,
    );
    if (!query.ok) return errorResponse(400, query.code, requestId);
    try {
      const result = await deps.reviews.listReferences({
        accessToken: token.value,
        query: query.value,
      });
      return Response.json(referenceListResponseSchema.parse({
        ok: true,
        data: { version: result.version, items: result.items },
        meta: { requestId, nextCursor: result.nextCursor },
      }));
    } catch (error) {
      return repositoryError(error, requestId, 'reference_query_failed');
    }
  };
}

export function createReferenceDetailHandler(deps: ReferenceReviewHandlerDependencies) {
  return detailHandler(
    deps,
    'referenceId',
    (token, id) => deps.reviews.getReference({ accessToken: token, referenceId: id }),
    referenceDetailResponseSchema,
  );
}

export function createReferenceRegisterHandler(deps: ReferenceReviewHandlerDependencies) {
  return mutationHandler(
    deps,
    registerReferenceCommandV1Schema,
    referenceMutationResponseSchema,
    (token, key, command: RegisterReferenceCommandV1) =>
      deps.reviews.registerReference({ accessToken: token, idempotencyKey: key, command }),
  );
}

export function createReferenceDecideHandler(deps: ReferenceReviewHandlerDependencies) {
  return identifiedMutationHandler(
    deps,
    'referenceId',
    decideReferenceCommandV1Schema,
    referenceMutationResponseSchema,
    (command: DecideReferenceCommandV1) => command.referenceId,
    (token, id, key, command: DecideReferenceCommandV1) =>
      deps.reviews.decideReference({
        accessToken: token,
        referenceId: id,
        idempotencyKey: key,
        command,
      }),
  );
}

export function createDomainAuthorityListHandler(deps: ReferenceReviewHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const token = await authenticate(request, deps.auth);
    if (token.failed) return errorResponse(500, 'reference_query_failed', requestId);
    if (token.value === null) return errorResponse(401, 'unauthorized', requestId);
    const query = parseQuery(
      new URL(request.url).searchParams,
      ['projectId', 'state', 'cursor', 'limit'],
      domainAuthorityReviewListQuerySchema,
    );
    if (!query.ok) return errorResponse(400, query.code, requestId);
    try {
      const result = await deps.reviews.listDomainAuthorities({
        accessToken: token.value,
        query: query.value,
      });
      return Response.json(authorityListResponseSchema.parse({
        ok: true,
        data: { version: result.version, items: result.items },
        meta: { requestId, nextCursor: result.nextCursor },
      }));
    } catch (error) {
      return repositoryError(error, requestId, 'reference_query_failed');
    }
  };
}

export function createDomainAuthorityDetailHandler(deps: ReferenceReviewHandlerDependencies) {
  return detailHandler(
    deps,
    'authorityId',
    (token, id) => deps.reviews.getDomainAuthority({ accessToken: token, authorityId: id }),
    authorityDetailResponseSchema,
  );
}

export function createDomainAuthorityRegisterHandler(deps: ReferenceReviewHandlerDependencies) {
  return mutationHandler(
    deps,
    registerDomainAuthorityCommandV1Schema,
    authorityMutationResponseSchema,
    (token, key, command: RegisterDomainAuthorityCommandV1) =>
      deps.reviews.registerDomainAuthority({ accessToken: token, idempotencyKey: key, command }),
  );
}

export function createDomainAuthorityDecideHandler(deps: ReferenceReviewHandlerDependencies) {
  return identifiedMutationHandler(
    deps,
    'authorityId',
    decideDomainAuthorityCommandV1Schema,
    authorityMutationResponseSchema,
    (command: DecideDomainAuthorityCommandV1) => command.authorityId,
    (token, id, key, command: DecideDomainAuthorityCommandV1) =>
      deps.reviews.decideDomainAuthority({
        accessToken: token,
        authorityId: id,
        idempotencyKey: key,
        command,
      }),
  );
}

// The public endpoint is anonymous by design. It reads the verified-reference
// projection only, never the reviewer repository and never a base table.
export function createPublicReferencesHandler(
  deps: Pick<ReferenceReviewHandlerDependencies, 'publicReferences' | 'ids'>,
) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const query = parseQuery(
      new URL(request.url).searchParams,
      ['projectId', 'cursor', 'limit'],
      publicProjectReferenceListQuerySchema,
    );
    if (!query.ok) return errorResponse(400, query.code, requestId);
    try {
      const result = await deps.publicReferences.listVerifiedReferences(
        query.value as PublicProjectReferenceListQuery,
      );
      return Response.json(publicReferencesResponseSchema.parse({
        ok: true,
        data: { items: result.items, nextCursor: result.nextCursor },
        meta: { requestId, nextCursor: result.nextCursor },
      }));
    } catch {
      return errorResponse(500, 'reference_query_failed', requestId);
    }
  };
}

type IdContext = { readonly params: Promise<Record<string, string>> };
type Authenticated = { readonly failed: true } | { readonly failed: false; readonly value: string | null };
type FailureCode = 'reference_query_failed' | 'reference_persistence_failed';

function detailHandler<T>(
  deps: ReferenceReviewHandlerDependencies,
  key: string,
  get: (token: string, id: string) => Promise<T>,
  schema: z.ZodType,
) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate();
    const token = await authenticate(request, deps.auth);
    if (token.failed) return errorResponse(500, 'reference_query_failed', requestId);
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
      return repositoryError(error, requestId, 'reference_query_failed');
    }
  };
}

function mutationHandler<TCommand>(
  deps: ReferenceReviewHandlerDependencies,
  commandSchema: z.ZodType<TCommand>,
  responseSchema: z.ZodType,
  submit: (token: string, idempotencyKey: string, command: TCommand) => Promise<unknown>,
) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const token = await authenticate(request, deps.auth);
    if (token.failed) return errorResponse(500, 'reference_persistence_failed', requestId);
    if (token.value === null) return errorResponse(401, 'unauthorized', requestId);
    const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'));
    const command = await parseJson(request, commandSchema);
    if (idempotencyKey === null || command === null) {
      return errorResponse(400, 'invalid_request', requestId);
    }
    try {
      const result = await submit(token.value, idempotencyKey, command);
      return Response.json(responseSchema.parse({
        ok: true,
        data: result,
        meta: { requestId, nextCursor: null },
      }));
    } catch (error) {
      return repositoryError(error, requestId, 'reference_persistence_failed');
    }
  };
}

function identifiedMutationHandler<TCommand>(
  deps: ReferenceReviewHandlerDependencies,
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
    if (token.failed) return errorResponse(500, 'reference_persistence_failed', requestId);
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
      return repositoryError(error, requestId, 'reference_persistence_failed');
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

function parseQuery<T>(
  params: URLSearchParams,
  allowed: readonly string[],
  schema: z.ZodType<T>,
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
  const cursor = params.get('cursor');
  const withoutCursor = schema.safeParse(Object.fromEntries([
    ...params.entries(),
    ['cursor', null],
    ['limit', limit === null ? undefined : Number(limit)],
  ]));
  if (!withoutCursor.success) return { ok: false, code: 'invalid_request' };
  if (cursor === null) return { ok: true, value: withoutCursor.data };
  // A malformed cursor is a client paging mistake, not a server failure, so it
  // gets its own code and the caller can restart from the first page.
  const withCursor = schema.safeParse({ ...withoutCursor.data, cursor });
  return withCursor.success
    ? { ok: true, value: withCursor.data }
    : { ok: false, code: 'invalid_cursor' };
}

function repositoryError(error: unknown, requestId: string, fallback: FailureCode): Response {
  const code = errorCode(error);
  if (code === 'reference_reviewer_required') return errorResponse(403, code, requestId);
  if (code === 'reference_not_found' || code === 'domain_authority_not_found') {
    return errorResponse(404, code, requestId);
  }
  if (code === 'reference_version_conflict' || code === 'reference_idempotency_conflict') {
    return errorResponse(409, code, requestId);
  }
  if (
    code === 'reference_not_decidable'
    || code === 'reference_command_invalid'
    || code === 'reference_evidence_required'
    || code === 'reference_normalization_invalid'
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
    case 'reference_reviewer_required':
      return 'Reviewer access is required.';
    case 'reference_not_found':
    case 'domain_authority_not_found':
      return 'The requested reference record was not found.';
    case 'reference_version_conflict':
      return 'The reference record has changed.';
    case 'reference_idempotency_conflict':
      return 'The idempotency key conflicts with a prior reference command.';
    case 'reference_query_failed':
      return 'Reference records could not be loaded.';
    default:
      return 'Reference review could not be completed.';
  }
}
