import {
  apiErrorSchema,
  blockedProjectSecurityListQuerySchema,
  createApiSuccessSchema,
  manualSecurityCandidateCommandV1Schema,
  publicBlockedProjectSecurityPageSchema,
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
} from '@airdrop/contracts';
import type { SecurityPublicRepository } from '@airdrop/database';
import type { SecurityReviewRepository } from '@airdrop/database/security-review';
import { z } from 'zod';

import type { AuthenticatedUserVerifier } from './authenticated-user.js';

export type { AuthenticatedUserVerifier } from './authenticated-user.js';

export type SecurityReviewHandlerDependencies = {
  readonly auth: AuthenticatedUserVerifier;
  readonly reviews: SecurityReviewRepository;
  readonly publicSecurity: SecurityPublicRepository;
  readonly ids: { generate(): string };
};

const uuidSchema = z.uuid();
const manualReceiptSchema = z.strictObject({
  version: z.literal(1), commandId: uuidSchema, candidateId: uuidSchema,
  candidateVersion: z.number().int().positive(), state: securityCandidateStateSchema,
  replayed: z.boolean(),
});
const candidateListResponseSchema = createApiSuccessSchema(z.strictObject({
  version: z.literal(1), items: z.array(reviewerSecurityCandidateListItemSchema),
}));
const candidateDetailResponseSchema = createApiSuccessSchema(reviewerSecurityCandidateDetailSchema);
const candidateMutationResponseSchema = createApiSuccessSchema(z.union([
  manualReceiptSchema, securityCandidateReviewReceiptV1Schema,
]));
const incidentListResponseSchema = createApiSuccessSchema(z.strictObject({
  version: z.literal(1), items: z.array(reviewerSecurityIncidentListItemSchema),
}));
const incidentDetailResponseSchema = createApiSuccessSchema(reviewerSecurityIncidentDetailSchema);
const incidentMutationResponseSchema = createApiSuccessSchema(securityIncidentCommandReceiptV1Schema);
const disclosureResponseSchema = createApiSuccessSchema(securityIndicatorDisclosureReceiptV1Schema);
const blockedProjectsResponseSchema = createApiSuccessSchema(publicBlockedProjectSecurityPageSchema);

export function createSecurityCandidateListHandler(deps: SecurityReviewHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const token = await authenticate(request, deps.auth).catch(() => undefined);
    if (token === undefined) return errorResponse(500, 'security_query_failed', requestId);
    if (token === null) return errorResponse(401, 'unauthorized', requestId);
    const query = parseQuery(new URL(request.url).searchParams, ['origin', 'state', 'targetType', 'cursor', 'limit'], securityCandidateListQuerySchema);
    if (!query.ok) return errorResponse(400, query.code, requestId);
    try {
      const result = await deps.reviews.listCandidates({ accessToken: token, query: query.value });
      return Response.json(candidateListResponseSchema.parse({ ok: true, data: { version: result.version, items: result.items }, meta: { requestId, nextCursor: result.nextCursor } }));
    } catch (error) { return repositoryError(error, requestId, 'security_query_failed'); }
  };
}

export function createSecurityCandidateSubmitHandler(deps: SecurityReviewHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const token = await authenticate(request, deps.auth).catch(() => undefined);
    if (token === undefined) return errorResponse(500, 'security_persistence_failed', requestId);
    if (token === null) return errorResponse(401, 'unauthorized', requestId);
    const key = parseIdempotencyKey(request.headers.get('idempotency-key'));
    const command = await parseJson(request, manualSecurityCandidateCommandV1Schema);
    if (key === null || command === null) return errorResponse(400, 'invalid_request', requestId);
    try {
      const result = await deps.reviews.submitManualCandidate({ accessToken: token, idempotencyKey: key, command });
      return Response.json(candidateMutationResponseSchema.parse({ ok: true, data: result, meta: { requestId, nextCursor: null } }));
    } catch (error) { return repositoryError(error, requestId, 'security_persistence_failed'); }
  };
}

export function createSecurityCandidateDetailHandler(deps: SecurityReviewHandlerDependencies) {
  return detailHandler(deps, 'candidateId', (token, id) => deps.reviews.getCandidate({ accessToken: token, candidateId: id }), candidateDetailResponseSchema);
}

export function createSecurityCandidateReviewHandler(deps: SecurityReviewHandlerDependencies) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate(); const token = await authenticate(request, deps.auth).catch(() => undefined);
    if (token === undefined) return errorResponse(500, 'security_persistence_failed', requestId);
    if (token === null) return errorResponse(401, 'unauthorized', requestId);
    const key = parseIdempotencyKey(request.headers.get('idempotency-key'));
    const id = uuidSchema.safeParse((await context.params).candidateId);
    const command = await parseJson(request, securityCandidateReviewCommandV1Schema);
    if (key === null || !id.success || command === null) return errorResponse(400, 'invalid_request', requestId);
    try {
      const result = await deps.reviews.reviewCandidate({ accessToken: token, candidateId: id.data, idempotencyKey: key, command });
      return Response.json(candidateMutationResponseSchema.parse({ ok: true, data: result, meta: { requestId, nextCursor: null } }));
    } catch (error) { return repositoryError(error, requestId, 'security_persistence_failed'); }
  };
}

export function createSecurityIncidentListHandler(deps: SecurityReviewHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate(); const token = await authenticate(request, deps.auth).catch(() => undefined);
    if (token === undefined) return errorResponse(500, 'security_query_failed', requestId);
    if (token === null) return errorResponse(401, 'unauthorized', requestId);
    const query = parseQuery(new URL(request.url).searchParams, ['state', 'targetType', 'cursor', 'limit'], securityIncidentListQuerySchema);
    if (!query.ok) return errorResponse(400, query.code, requestId);
    try {
      const result = await deps.reviews.listIncidents({ accessToken: token, query: query.value });
      return Response.json(incidentListResponseSchema.parse({ ok: true, data: { version: result.version, items: result.items }, meta: { requestId, nextCursor: result.nextCursor } }));
    } catch (error) { return repositoryError(error, requestId, 'security_query_failed'); }
  };
}

export function createSecurityIncidentDetailHandler(deps: SecurityReviewHandlerDependencies) {
  return detailHandler(deps, 'incidentId', (token, id) => deps.reviews.getIncident({ accessToken: token, incidentId: id }), incidentDetailResponseSchema);
}

export function createSecurityIncidentOpenHandler(deps: SecurityReviewHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate(); const token = await authenticate(request, deps.auth).catch(() => undefined);
    if (token === undefined) return errorResponse(500, 'security_persistence_failed', requestId);
    if (token === null) return errorResponse(401, 'unauthorized', requestId);
    const key = parseIdempotencyKey(request.headers.get('idempotency-key'));
    const command = await parseJson(request, securityIncidentCommandV1Schema);
    if (key === null || command === null || command.action !== 'open') return errorResponse(400, 'invalid_request', requestId);
    try {
      const result = await deps.reviews.openIncident({ accessToken: token, idempotencyKey: key, command });
      return Response.json(incidentMutationResponseSchema.parse({ ok: true, data: result, meta: { requestId, nextCursor: null } }));
    } catch (error) { return repositoryError(error, requestId, 'security_persistence_failed'); }
  };
}

export function createSecurityIncidentCommandHandler(deps: SecurityReviewHandlerDependencies) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate(); const token = await authenticate(request, deps.auth).catch(() => undefined);
    if (token === undefined) return errorResponse(500, 'security_persistence_failed', requestId);
    if (token === null) return errorResponse(401, 'unauthorized', requestId);
    const key = parseIdempotencyKey(request.headers.get('idempotency-key'));
    const id = uuidSchema.safeParse((await context.params).incidentId);
    const command = await parseJson(request, securityIncidentCommandV1Schema);
    if (key === null || !id.success || command === null || command.action === 'open') return errorResponse(400, 'invalid_request', requestId);
    try {
      const result = await deps.reviews.commandIncident({ accessToken: token, incidentId: id.data, idempotencyKey: key, command });
      return Response.json(incidentMutationResponseSchema.parse({ ok: true, data: result, meta: { requestId, nextCursor: null } }));
    } catch (error) { return repositoryError(error, requestId, 'security_persistence_failed'); }
  };
}

export function createSecurityIndicatorDisclosureHandler(deps: SecurityReviewHandlerDependencies) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate(); const token = await authenticate(request, deps.auth).catch(() => undefined);
    if (token === undefined) return errorResponse(500, 'security_persistence_failed', requestId);
    if (token === null) return errorResponse(401, 'unauthorized', requestId);
    const key = parseIdempotencyKey(request.headers.get('idempotency-key'));
    const id = uuidSchema.safeParse((await context.params).indicatorId);
    const command = await parseJson(request, securityIndicatorDisclosureCommandV1Schema);
    if (key === null || !id.success || command === null) return errorResponse(400, 'invalid_request', requestId);
    try {
      const result = await deps.reviews.setIndicatorDisclosure({ accessToken: token, indicatorId: id.data, idempotencyKey: key, command });
      return Response.json(disclosureResponseSchema.parse({ ok: true, data: result, meta: { requestId, nextCursor: null } }));
    } catch (error) { return repositoryError(error, requestId, 'security_persistence_failed'); }
  };
}

export function createSecurityPublicBlockedProjectsHandler(deps: Pick<SecurityReviewHandlerDependencies, 'publicSecurity' | 'ids'>) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const query = parseQuery(new URL(request.url).searchParams, ['cursor', 'limit'], blockedProjectSecurityListQuerySchema);
    if (!query.ok) return errorResponse(400, query.code, requestId);
    try {
      const result = await deps.publicSecurity.listBlockedProjects(query.value);
      return Response.json(blockedProjectsResponseSchema.parse({ ok: true, data: result, meta: { requestId, nextCursor: result.nextCursor } }));
    } catch { return errorResponse(500, 'security_query_failed', requestId); }
  };
}

type IdContext = { readonly params: Promise<Record<string, string>> };
function detailHandler<T>(deps: SecurityReviewHandlerDependencies, key: string, get: (token: string, id: string) => Promise<T>, schema: z.ZodType) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate(); const token = await authenticate(request, deps.auth).catch(() => undefined);
    if (token === undefined) return errorResponse(500, 'security_query_failed', requestId);
    if (token === null) return errorResponse(401, 'unauthorized', requestId);
    const id = uuidSchema.safeParse((await context.params)[key]);
    if (!id.success) return errorResponse(400, 'invalid_request', requestId);
    try { return Response.json(schema.parse({ ok: true, data: await get(token, id.data), meta: { requestId, nextCursor: null } })); }
    catch (error) { return repositoryError(error, requestId, 'security_query_failed'); }
  };
}
async function authenticate(request: Request, auth: AuthenticatedUserVerifier): Promise<string | null> { const header = request.headers.get('authorization'); const user = await auth.verifyAuthorizationHeader(header); return user === null ? null : bearer(header); }
function bearer(value: string | null): string | null { return value === null ? null : /^Bearer ([^\s]+)$/.exec(value)?.[1] ?? null; }
async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T | null> { try { return schema.parse(await request.json()); } catch { return null; } }
function parseIdempotencyKey(value: string | null): string | null { return value === null || value !== value.trim() || Array.from(value).length < 1 || Array.from(value).length > 255 || !postgresText(value) ? null : value; }
function postgresText(value: string): boolean { if (value.includes('\u0000')) return false; for (let i = 0; i < value.length; i += 1) { const code = value.charCodeAt(i); if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(i + 1); if (next < 0xdc00 || next > 0xdfff) return false; i += 1; } else if (code >= 0xdc00 && code <= 0xdfff) return false; } return true; }
function parseQuery<T>(params: URLSearchParams, allowed: readonly string[], schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; code: 'invalid_request' | 'invalid_cursor' } { for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) return { ok: false, code: 'invalid_request' }; const limit = params.get('limit'); if (limit !== null && !/^[1-9][0-9]*$/u.test(limit)) return { ok: false, code: 'invalid_request' }; const cursor = params.get('cursor'); const input = Object.fromEntries([...params.entries(), ['cursor', null], ['limit', limit === null ? undefined : Number(limit)]]); const without = schema.safeParse(input); if (!without.success) return { ok: false, code: 'invalid_request' }; if (cursor === null) return { ok: true, value: without.data }; const withCursor = schema.safeParse({ ...without.data, cursor }); return withCursor.success ? { ok: true, value: withCursor.data } : { ok: false, code: 'invalid_cursor' }; }
function repositoryError(error: unknown, requestId: string, fallback: 'security_query_failed' | 'security_persistence_failed'): Response { const code = errorCode(error); if (code === 'security_reviewer_required') return errorResponse(403, code, requestId); if (code === 'security_candidate_not_found' || code === 'security_incident_not_found' || code === 'security_indicator_not_found') return errorResponse(404, code, requestId); if (code === 'security_version_conflict' || code === 'security_idempotency_conflict') return errorResponse(409, code, requestId); if (code === 'security_candidate_not_reviewable' || code === 'security_command_invalid' || code === 'security_target_mismatch' || code === 'security_promotion_blocked' || code === 'security_review_required') return errorResponse(400, 'invalid_request', requestId); return errorResponse(500, fallback, requestId); }
function errorCode(error: unknown): string | undefined { return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined; }
function errorResponse(status: number, code: string, requestId: string): Response { return Response.json(apiErrorSchema.parse({ ok: false, error: { code, message: messageFor(code), requestId, details: null } }), { status }); }
function messageFor(code: string): string { switch (code) { case 'unauthorized': return 'Authentication is required.'; case 'invalid_request': return 'The request is invalid.'; case 'invalid_cursor': return 'The cursor is invalid.'; case 'security_reviewer_required': return 'Reviewer access is required.'; case 'security_candidate_not_found': case 'security_incident_not_found': case 'security_indicator_not_found': return 'The requested security record was not found.'; case 'security_version_conflict': return 'The security record has changed.'; case 'security_idempotency_conflict': return 'The idempotency key conflicts with a prior security command.'; case 'security_query_failed': return 'Security records could not be loaded.'; default: return 'Security review could not be completed.'; } }
