import {
  apiErrorSchema,
  createApiSuccessSchema,
  publicTutorialDetailSchema,
  publicTutorialListItemSchema,
  publicTutorialListQuerySchema,
} from '@airdrop/contracts';
import type { TutorialPublicRepository } from '@airdrop/database';
import { z } from 'zod';

import {
  decodePublicTutorialCursor,
  encodePublicTutorialCursor,
} from './tutorial-cursor.js';

export type TutorialPublicHandlerDependencies = {
  readonly publicTutorials: TutorialPublicRepository;
  readonly ids: { generate(): string };
};

const publicListResponseSchema = createApiSuccessSchema(z.strictObject({
  items: z.array(publicTutorialListItemSchema),
  nextCursor: z.string().min(1).nullable(),
}));
const publicDetailResponseSchema = createApiSuccessSchema(publicTutorialDetailSchema);

// The public endpoints are anonymous by design. They read the published
// tutorial projections only, never the reviewer repository and never a base
// table. Detail failures surface as 404 without internals.
export function createPublicTutorialsHandler(deps: TutorialPublicHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const query = parseListQuery(new URL(request.url).searchParams);
    if (!query.ok) return errorResponse(400, query.code, requestId);
    try {
      const result = await deps.publicTutorials.listProjectTutorials(query.value);
      const nextCursor = result.nextCursor === null
        ? null
        : encodePublicTutorialCursor(result.nextCursor);
      return Response.json(publicListResponseSchema.parse({
        ok: true,
        data: { items: result.items, nextCursor },
        meta: { requestId, nextCursor },
      }));
    } catch {
      return errorResponse(500, 'tutorial_query_failed', requestId);
    }
  };
}

export function createPublicTutorialDetailHandler(deps: TutorialPublicHandlerDependencies) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    const requestId = deps.ids.generate();
    const id = z.uuid().safeParse((await context.params).id);
    if (!id.success) return errorResponse(400, 'invalid_request', requestId);
    try {
      const result = await deps.publicTutorials.getTutorial({ tutorialId: id.data });
      return Response.json(publicDetailResponseSchema.parse({
        ok: true,
        data: result,
        meta: { requestId, nextCursor: null },
      }));
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        && typeof (error as { code: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined;
      if (code === 'tutorial_not_found') {
        return errorResponse(404, 'tutorial_not_found', requestId);
      }
      return errorResponse(500, 'tutorial_query_failed', requestId);
    }
  };
}

function parseListQuery(
  params: URLSearchParams,
): { ok: true; value: { projectId: string; cursor: { publishedAt: string; tutorialId: string } | null; limit: number } }
  | { ok: false; code: 'invalid_request' | 'invalid_cursor' } {
  for (const key of params.keys()) {
    if (!['projectId', 'cursor', 'limit'].includes(key) || params.getAll(key).length !== 1) {
      return { ok: false, code: 'invalid_request' };
    }
  }
  const projectId = params.get('projectId');
  const limit = params.get('limit');
  if (projectId === null || (limit !== null && !/^[1-9][0-9]*$/u.test(limit))) {
    return { ok: false, code: 'invalid_request' };
  }
  const decodedCursor = decodePublicTutorialCursor(params.get('cursor') ?? undefined);
  if (decodedCursor === 'invalid') return { ok: false, code: 'invalid_cursor' };
  const query = publicTutorialListQuerySchema.safeParse({
    projectId,
    cursor: decodedCursor,
    limit: limit === null ? undefined : Number(limit),
  });
  return query.success
    ? { ok: true, value: query.data }
    : { ok: false, code: 'invalid_request' };
}

function errorResponse(status: number, code: string, requestId: string): Response {
  return Response.json(
    apiErrorSchema.parse({
      ok: false,
      error: {
        code,
        message: code === 'tutorial_not_found'
          ? 'The requested tutorial was not found.'
          : code === 'invalid_cursor'
            ? 'The cursor is invalid.'
            : 'The request is invalid.',
        requestId,
        details: null,
      },
    }),
    { status },
  );
}
