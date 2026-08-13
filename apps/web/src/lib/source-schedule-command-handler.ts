import {
  apiErrorSchema,
  createApiSuccessSchema,
  sourceScheduleCommandResultSchema,
  sourceScheduleCommandSchema,
} from '@airdrop/contracts';
import type {
  ScheduleCommandRepository,
} from '@airdrop/database/schedule-admin';

import type { AuthenticatedUserVerifier } from './authenticated-user.js';

export type { AuthenticatedUserVerifier } from './authenticated-user.js';

const sourceScheduleCommandResponseSchema = createApiSuccessSchema(sourceScheduleCommandResultSchema);

export function createSourceScheduleCommandHandler(deps: {
  auth: AuthenticatedUserVerifier;
  schedules: ScheduleCommandRepository;
  ids: { generate(): string };
}): (request: Request, context: { params: Promise<{ scheduleId: string }> }) => Promise<Response> {
  return async (request, context) => {
    const requestId = deps.ids.generate();
    if (!isBearerHeader(request.headers.get('authorization'))) {
      return errorResponse(401, 'unauthorized', requestId);
    }
    const user = await deps.auth.verifyAuthorizationHeader(request.headers.get('authorization'));
    if (user === null) return errorResponse(401, 'unauthorized', requestId);

    const idempotencyKey = request.headers.get('idempotency-key');
    if (!validIdempotencyKey(idempotencyKey)) return errorResponse(400, 'invalid_request', requestId);

    const { scheduleId } = await context.params;
    if (!isUuid(scheduleId)) return errorResponse(400, 'invalid_request', requestId);

    const command = await parseJsonCommand(request);
    if (command === null) return errorResponse(400, 'invalid_request', requestId);

    try {
      const result = await deps.schedules.execute({
        actorId: user.userId,
        scheduleId,
        idempotencyKey,
        command,
      });
      return Response.json(sourceScheduleCommandResponseSchema.parse({
        ok: true,
        data: result,
        meta: { requestId, nextCursor: null },
      }));
    } catch (error) {
      return scheduleCommandErrorResponse(error, requestId);
    }
  };
}

async function parseJsonCommand(request: Request) {
  try {
    return sourceScheduleCommandSchema.parse(await request.json());
  } catch {
    return null;
  }
}

function scheduleCommandErrorResponse(error: unknown, requestId: string): Response {
  const code = errorCode(error);
  if (code === 'admin_required') return errorResponse(403, code, requestId);
  if (code === 'schedule_not_found') return errorResponse(404, code, requestId);
  if (code === 'schedule_version_conflict' || code === 'idempotency_conflict') {
    return errorResponse(409, code, requestId);
  }
  return errorResponse(500, 'schedule_command_persistence_failed', requestId);
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
    case 'admin_required': return 'Administrator access is required.';
    case 'schedule_not_found': return 'The schedule was not found.';
    case 'schedule_version_conflict': return 'The schedule has changed.';
    case 'idempotency_conflict': return 'The idempotency key conflicts with a prior command.';
    default: return 'The schedule command could not be persisted.';
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function validIdempotencyKey(value: string | null): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 255 && value === value.trim();
}

function isBearerHeader(value: string | null): boolean {
  return value !== null && /^Bearer [^\s]+$/.test(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
