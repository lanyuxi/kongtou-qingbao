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
  tutorialPublishReceiptSchema,
  tutorialRejectReceiptSchema,
  tutorialRetireReceiptSchema,
  tutorialReviewDetailSchema,
  tutorialReviewListItemSchema,
  type AcceptTutorialCandidateCommandV1,
  type PublishTutorialVersionCommandV1,
  type RejectTutorialCandidateCommandV1,
  type RetireTutorialCommandV1,
  type TutorialCandidateReviewDetail,
  type TutorialCandidateReviewListItem,
  type TutorialCandidateReviewListQuery,
  type TutorialReviewDetail,
  type TutorialReviewListItem,
  type TutorialReviewListQuery,
} from '@airdrop/contracts';
import { z } from 'zod';

import type { ReviewSessionController } from './review-session.js';

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

export type TutorialReviewConflictCode =
  | 'tutorial_version_conflict'
  | 'tutorial_idempotency_conflict';
export type TutorialReviewApiFailure =
  | { readonly ok: false; readonly state: 'sign_in_required' }
  | { readonly ok: false; readonly state: 'forbidden' }
  | { readonly ok: false; readonly state: 'not_found' }
  | { readonly ok: false; readonly state: 'conflict'; readonly code: TutorialReviewConflictCode }
  | { readonly ok: false; readonly state: 'request_failed' };
export type TutorialReviewApiSuccess<T> = {
  readonly ok: true;
  readonly data: T;
  readonly nextCursor: string | null;
};

export interface TutorialReviewApiClient {
  listCandidates(query: TutorialCandidateListQueryInput): Promise<
    TutorialReviewApiSuccess<{ version: 1; items: readonly TutorialCandidateReviewListItem[] }>
    | TutorialReviewApiFailure
  >;
  getCandidate(candidateId: string): Promise<
    TutorialReviewApiSuccess<TutorialCandidateReviewDetail> | TutorialReviewApiFailure
  >;
  listTutorials(query: TutorialListQueryInput): Promise<
    TutorialReviewApiSuccess<{ version: 1; items: readonly TutorialReviewListItem[] }>
    | TutorialReviewApiFailure
  >;
  getTutorial(tutorialId: string): Promise<
    TutorialReviewApiSuccess<TutorialReviewDetail> | TutorialReviewApiFailure
  >;
  acceptCandidate(command: AcceptTutorialCandidateCommandV1): Promise<
    TutorialReviewApiSuccess<z.infer<typeof tutorialAcceptReceiptSchema>> | TutorialReviewApiFailure
  >;
  rejectCandidate(command: RejectTutorialCandidateCommandV1): Promise<
    TutorialReviewApiSuccess<z.infer<typeof tutorialRejectReceiptSchema>> | TutorialReviewApiFailure
  >;
  publishVersion(
    tutorialId: string,
    command: PublishTutorialVersionCommandV1,
  ): Promise<
    TutorialReviewApiSuccess<z.infer<typeof tutorialPublishReceiptSchema>> | TutorialReviewApiFailure
  >;
  retire(
    tutorialId: string,
    command: RetireTutorialCommandV1,
  ): Promise<
    TutorialReviewApiSuccess<z.infer<typeof tutorialRetireReceiptSchema>> | TutorialReviewApiFailure
  >;
}

// The UI keeps the cursor as an opaque transport token: the response meta
// hands out the encoded token and the next request passes it back verbatim.
// The server-side handler owns decoding and validation.
export type TutorialCandidateListQueryInput = {
  readonly status: TutorialCandidateReviewListQuery['status'];
  readonly cursor: string | null;
  readonly limit: number;
};

export type TutorialListQueryInput = {
  readonly status: TutorialReviewListQuery['status'];
  readonly cursor: string | null;
  readonly limit: number;
};

const candidateInputSchema = z.strictObject({
  status: z.enum(['all', 'pending', 'accepted', 'rejected']),
  cursor: z.string().min(1).nullable(),
  limit: z.number().int().min(1).max(100),
});

const tutorialInputSchema = z.strictObject({
  status: z.enum(['all', 'published', 'needs_review', 'blocked', 'retired']),
  cursor: z.string().min(1).nullable(),
  limit: z.number().int().min(1).max(100),
});

type Dependencies = {
  readonly session: ReviewSessionController;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly ids: { generate(): string };
};

export function createTutorialReviewApiClient(deps: Dependencies): TutorialReviewApiClient {
  return {
    async listCandidates(query) {
      const parsed = candidateInputSchema.safeParse(query);
      return !parsed.success
        ? failed()
        : get(deps, `/api/v1/review/tutorials/candidates?${searchWithToken(parsed.data).toString()}`, candidateListResponseSchema);
    },
    async getCandidate(id) {
      return uuidSchema.safeParse(id).success
        ? get(deps, `/api/v1/review/tutorials/candidates/${id}`, candidateDetailResponseSchema)
        : failed();
    },
    async listTutorials(query) {
      const parsed = tutorialInputSchema.safeParse(query);
      return !parsed.success
        ? failed()
        : get(deps, `/api/v1/review/tutorials?${searchWithToken(parsed.data).toString()}`, tutorialListResponseSchema);
    },
    async getTutorial(id) {
      return uuidSchema.safeParse(id).success
        ? get(deps, `/api/v1/review/tutorials/${id}`, tutorialDetailResponseSchema)
        : failed();
    },
    async acceptCandidate(command) {
      const parsed = acceptTutorialCandidateCommandV1Schema.safeParse(command);
      return !parsed.success
        ? failed()
        : mutation(deps, `/api/v1/review/tutorials/candidates/${parsed.data.candidateId}/accept`, parsed.data, acceptResponseSchema);
    },
    async rejectCandidate(command) {
      const parsed = rejectTutorialCandidateCommandV1Schema.safeParse(command);
      return !parsed.success
        ? failed()
        : mutation(deps, `/api/v1/review/tutorials/candidates/${parsed.data.candidateId}/reject`, parsed.data, rejectResponseSchema);
    },
    async publishVersion(id, command) {
      const parsedId = uuidSchema.safeParse(id);
      const parsed = publishTutorialVersionCommandV1Schema.safeParse(command);
      return !parsedId.success || !parsed.success || parsed.data.tutorialId !== parsedId.data
        ? failed()
        : mutation(deps, `/api/v1/review/tutorials/${parsedId.data}/publish`, parsed.data, publishResponseSchema);
    },
    async retire(id, command) {
      const parsedId = uuidSchema.safeParse(id);
      const parsed = retireTutorialCommandV1Schema.safeParse(command);
      return !parsedId.success || !parsed.success || parsed.data.tutorialId !== parsedId.data
        ? failed()
        : mutation(deps, `/api/v1/review/tutorials/${parsedId.data}/retire`, parsed.data, retireResponseSchema);
    },
  };
}

function searchWithToken(value: Record<string, unknown>): URLSearchParams {
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
): Promise<TutorialReviewApiSuccess<T> | TutorialReviewApiFailure> {
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
): Promise<TutorialReviewApiSuccess<T> | TutorialReviewApiFailure> {
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
function mapError(status: number, code: string): TutorialReviewApiFailure {
  if (status === 401 && code === 'unauthorized') return signInRequired();
  if (status === 403 && code === 'tutorial_reviewer_required') {
    return { ok: false, state: 'forbidden' };
  }
  if (status === 404 && code === 'tutorial_not_found') return { ok: false, state: 'not_found' };
  if (status === 409 && (code === 'tutorial_version_conflict' || code === 'tutorial_idempotency_conflict')) {
    return { ok: false, state: 'conflict', code };
  }
  return failed();
}

function validKey(value: string): boolean {
  return value === value.trim() && Array.from(value).length >= 1 && Array.from(value).length <= 255;
}

function signInRequired(): TutorialReviewApiFailure {
  return { ok: false, state: 'sign_in_required' };
}

function failed(): TutorialReviewApiFailure {
  return { ok: false, state: 'request_failed' };
}
