import {
  apiErrorSchema,
  createApiSuccessSchema,
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
  type ReferenceReviewListQuery,
  type RegisterDomainAuthorityCommandV1,
  type RegisterReferenceCommandV1,
  type ReviewerDomainAuthorityDetail,
  type ReviewerDomainAuthorityListItem,
  type ReviewerReferenceDetail,
  type ReviewerReferenceListItem,
} from '@airdrop/contracts';
import { z } from 'zod';

import type { ReviewSessionController } from './review-session.js';

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

export type ReferenceReviewConflictCode =
  | 'reference_version_conflict'
  | 'reference_idempotency_conflict';
export type ReferenceReviewApiFailure =
  | { readonly ok: false; readonly state: 'sign_in_required' }
  | { readonly ok: false; readonly state: 'forbidden' }
  | { readonly ok: false; readonly state: 'not_found' }
  | { readonly ok: false; readonly state: 'conflict'; readonly code: ReferenceReviewConflictCode }
  | { readonly ok: false; readonly state: 'request_failed' };
export type ReferenceReviewApiSuccess<T> = {
  readonly ok: true;
  readonly data: T;
  readonly nextCursor: string | null;
};

export interface ReferenceReviewApiClient {
  listReferences(query: ReferenceReviewListQuery): Promise<
    ReferenceReviewApiSuccess<{ version: 1; items: readonly ReviewerReferenceListItem[] }>
    | ReferenceReviewApiFailure
  >;
  listDomainAuthorities(query: DomainAuthorityReviewListQuery): Promise<
    ReferenceReviewApiSuccess<{ version: 1; items: readonly ReviewerDomainAuthorityListItem[] }>
    | ReferenceReviewApiFailure
  >;
  getReference(referenceId: string): Promise<
    ReferenceReviewApiSuccess<ReviewerReferenceDetail> | ReferenceReviewApiFailure
  >;
  getDomainAuthority(authorityId: string): Promise<
    ReferenceReviewApiSuccess<ReviewerDomainAuthorityDetail> | ReferenceReviewApiFailure
  >;
  registerReference(command: RegisterReferenceCommandV1): Promise<
    ReferenceReviewApiSuccess<ReferenceCommandReceiptV1> | ReferenceReviewApiFailure
  >;
  registerDomainAuthority(command: RegisterDomainAuthorityCommandV1): Promise<
    ReferenceReviewApiSuccess<DomainAuthorityCommandReceiptV1> | ReferenceReviewApiFailure
  >;
  decideReference(
    referenceId: string,
    command: DecideReferenceCommandV1,
  ): Promise<ReferenceReviewApiSuccess<ReferenceCommandReceiptV1> | ReferenceReviewApiFailure>;
  decideDomainAuthority(
    authorityId: string,
    command: DecideDomainAuthorityCommandV1,
  ): Promise<
    ReferenceReviewApiSuccess<DomainAuthorityCommandReceiptV1> | ReferenceReviewApiFailure
  >;
}

type Dependencies = {
  readonly session: ReviewSessionController;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly ids: { generate(): string };
};

export function createReferenceReviewApiClient(deps: Dependencies): ReferenceReviewApiClient {
  return {
    async listReferences(query) {
      const parsed = referenceReviewListQuerySchema.safeParse(query);
      return !parsed.success
        ? failed()
        : get(deps, `/api/v1/review/references?${search(parsed.data).toString()}`, referenceListResponseSchema);
    },
    async listDomainAuthorities(query) {
      const parsed = domainAuthorityReviewListQuerySchema.safeParse(query);
      return !parsed.success
        ? failed()
        : get(deps, `/api/v1/review/references/authorities?${search(parsed.data).toString()}`, authorityListResponseSchema);
    },
    async getReference(id) {
      return uuidSchema.safeParse(id).success
        ? get(deps, `/api/v1/review/references/${id}`, referenceDetailResponseSchema)
        : failed();
    },
    async getDomainAuthority(id) {
      return uuidSchema.safeParse(id).success
        ? get(deps, `/api/v1/review/references/authorities/${id}`, authorityDetailResponseSchema)
        : failed();
    },
    async registerReference(command) {
      const parsed = registerReferenceCommandV1Schema.safeParse(command);
      return !parsed.success
        ? failed()
        : mutation(deps, '/api/v1/review/references', parsed.data, referenceMutationResponseSchema);
    },
    async registerDomainAuthority(command) {
      const parsed = registerDomainAuthorityCommandV1Schema.safeParse(command);
      return !parsed.success
        ? failed()
        : mutation(deps, '/api/v1/review/references/authorities', parsed.data, authorityMutationResponseSchema);
    },
    async decideReference(id, command) {
      const parsedId = uuidSchema.safeParse(id);
      const parsed = decideReferenceCommandV1Schema.safeParse(command);
      return !parsedId.success || !parsed.success || parsed.data.referenceId !== parsedId.data
        ? failed()
        : mutation(deps, `/api/v1/review/references/${parsedId.data}/decisions`, parsed.data, referenceMutationResponseSchema);
    },
    async decideDomainAuthority(id, command) {
      const parsedId = uuidSchema.safeParse(id);
      const parsed = decideDomainAuthorityCommandV1Schema.safeParse(command);
      return !parsedId.success || !parsed.success || parsed.data.authorityId !== parsedId.data
        ? failed()
        : mutation(deps, `/api/v1/review/references/authorities/${parsedId.data}/decisions`, parsed.data, authorityMutationResponseSchema);
    },
  };
}

function search(value: Record<string, unknown>): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, item] of Object.entries(value)) {
    if (item !== null) result.set(key, String(item));
  }
  return result;
}

async function get<T>(
  deps: Dependencies,
  input: string,
  schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>,
) {
  return request(deps, input, {}, schema);
}

async function mutation<T>(
  deps: Dependencies,
  input: string,
  body: unknown,
  schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>,
): Promise<ReferenceReviewApiSuccess<T> | ReferenceReviewApiFailure> {
  let idempotencyKey: string;
  try {
    idempotencyKey = deps.ids.generate();
  } catch {
    return failed();
  }
  if (!validKey(idempotencyKey)) return failed();
  return request(deps, input, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify(body),
  }, schema);
}

async function request<T>(
  deps: Dependencies,
  input: string,
  init: RequestInit,
  schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>,
): Promise<ReferenceReviewApiSuccess<T> | ReferenceReviewApiFailure> {
  let token: string | null;
  try {
    token = await deps.session.getAccessToken();
  } catch {
    return signInRequired();
  }
  if (token === null || !/^\S+$/u.test(token)) return signInRequired();
  try {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    const response = await deps.fetch(input, { ...init, headers });
    const payload: unknown = await response.json();
    if (response.ok) {
      const parsed = schema.safeParse(payload);
      return parsed.success
        ? { ok: true, data: parsed.data.data, nextCursor: parsed.data.meta.nextCursor }
        : failed();
    }
    const parsed = apiErrorSchema.safeParse(payload);
    return parsed.success ? mapError(response.status, parsed.data.error.code) : failed();
  } catch {
    return failed();
  }
}

// A 409 is terminal: the caller must reload and re-confirm against the newer
// aggregate version, so it is reported as a typed conflict and never retried.
function mapError(status: number, code: string): ReferenceReviewApiFailure {
  if (status === 401 && code === 'unauthorized') return signInRequired();
  if (status === 403 && code === 'reference_reviewer_required') return { ok: false, state: 'forbidden' };
  if (status === 404 && (code === 'reference_not_found' || code === 'domain_authority_not_found')) {
    return { ok: false, state: 'not_found' };
  }
  if (status === 409 && (code === 'reference_version_conflict' || code === 'reference_idempotency_conflict')) {
    return { ok: false, state: 'conflict', code };
  }
  return failed();
}

function validKey(value: string): boolean {
  return value === value.trim() && Array.from(value).length >= 1 && Array.from(value).length <= 255;
}

function signInRequired(): ReferenceReviewApiFailure {
  return { ok: false, state: 'sign_in_required' };
}

function failed(): ReferenceReviewApiFailure {
  return { ok: false, state: 'request_failed' };
}
