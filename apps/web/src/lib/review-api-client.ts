import {
  apiErrorSchema,
  createApiSuccessSchema,
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
import { z } from 'zod';

import type { ReviewSessionController } from './review-session.js';

const listDataSchema = z.strictObject({
  version: z.literal(1),
  items: z.array(failedAiRunListItemSchema),
});
const listResponseSchema = createApiSuccessSchema(listDataSchema);
const detailResponseSchema = createApiSuccessSchema(failedAiRunDetailSchema);
const decisionResponseSchema = createApiSuccessSchema(failedAiRunDecisionResultSchema);
const runIdSchema = z.string().uuid();

export type ReviewApiFailure =
  | { readonly ok: false; readonly state: 'sign_in_required' }
  | { readonly ok: false; readonly state: 'forbidden' }
  | { readonly ok: false; readonly state: 'not_found' }
  | {
      readonly ok: false;
      readonly state: 'conflict';
      readonly code: 'review_version_conflict' | 'review_idempotency_conflict';
    }
  | { readonly ok: false; readonly state: 'request_failed' };

export type ReviewApiSuccess<T> = {
  readonly ok: true;
  readonly data: T;
  readonly nextCursor: string | null;
};

export interface ReviewApiClient {
  list(query: FailedAiRunListQuery): Promise<
    ReviewApiSuccess<{ readonly version: 1; readonly items: FailedAiRunListItem[] }>
    | ReviewApiFailure
  >;
  get(runId: string): Promise<ReviewApiSuccess<FailedAiRunDetail> | ReviewApiFailure>;
  decide(runId: string, command: FailedAiRunDecisionCommand): Promise<
    ReviewApiSuccess<FailedAiRunDecisionResult> | ReviewApiFailure
  >;
}

type ReviewApiClientDependencies = {
  readonly session: ReviewSessionController;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  readonly ids: { generate(): string };
};

export function createReviewApiClient(deps: ReviewApiClientDependencies): ReviewApiClient {
  return {
    async list(query) {
      const parsedQuery = failedAiRunListQuerySchema.safeParse(query);
      if (!parsedQuery.success) return requestFailed();

      const search = new URLSearchParams({
        reviewState: parsedQuery.data.reviewState,
        status: parsedQuery.data.status,
      });
      if (parsedQuery.data.cursor !== null) search.set('cursor', parsedQuery.data.cursor);
      search.set('limit', String(parsedQuery.data.limit));

      return request(deps, `/api/v1/review/ai-runs?${search.toString()}`, {}, listResponseSchema);
    },

    async get(runId) {
      const parsedRunId = runIdSchema.safeParse(runId);
      if (!parsedRunId.success) return requestFailed();
      return request(
        deps,
        `/api/v1/review/ai-runs/${parsedRunId.data}`,
        {},
        detailResponseSchema,
      );
    },

    async decide(runId, command) {
      const parsedRunId = runIdSchema.safeParse(runId);
      const parsedCommand = failedAiRunDecisionCommandSchema.safeParse(command);
      if (!parsedRunId.success || !parsedCommand.success) return requestFailed();

      let idempotencyKey: string;
      try {
        idempotencyKey = deps.ids.generate();
      } catch {
        return requestFailed();
      }
      if (!isValidIdempotencyKey(idempotencyKey)) return requestFailed();

      return request(
        deps,
        `/api/v1/review/ai-runs/${parsedRunId.data}/decisions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
          body: JSON.stringify(parsedCommand.data),
        },
        decisionResponseSchema,
      );
    },
  };
}

async function request<T>(
  deps: ReviewApiClientDependencies,
  input: string,
  init: RequestInit,
  successSchema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>,
): Promise<ReviewApiSuccess<T> | ReviewApiFailure> {
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
      const parsed = successSchema.safeParse(payload);
      return parsed.success
        ? { ok: true, data: parsed.data.data, nextCursor: parsed.data.meta.nextCursor }
        : requestFailed();
    }

    const parsed = apiErrorSchema.safeParse(payload);
    if (!parsed.success) return requestFailed();
    return mapError(response.status, parsed.data.error.code);
  } catch {
    return requestFailed();
  }
}

function mapError(status: number, code: string): ReviewApiFailure {
  if (status === 401 && code === 'unauthorized') return signInRequired();
  if (status === 403 && code === 'reviewer_required') return { ok: false, state: 'forbidden' };
  if (status === 404 && code === 'review_run_not_found') return { ok: false, state: 'not_found' };
  if (status === 409
    && (code === 'review_version_conflict' || code === 'review_idempotency_conflict')) {
    return { ok: false, state: 'conflict', code };
  }
  return requestFailed();
}

function isValidIdempotencyKey(value: string): boolean {
  return value === value.trim() && Array.from(value).length >= 1 && Array.from(value).length <= 255;
}

function signInRequired(): ReviewApiFailure {
  return { ok: false, state: 'sign_in_required' };
}

function requestFailed(): ReviewApiFailure {
  return { ok: false, state: 'request_failed' };
}
