import {
  addWatchlistProjectCommandSchema,
  addWatchlistProjectReceiptSchema,
  apiErrorSchema,
  createApiSuccessSchema,
  createTaskCommandSchema,
  createTaskReceiptSchema,
  createWatchlistCommandSchema,
  createWatchlistReceiptSchema,
  deleteTaskCommandSchema,
  deleteTaskReceiptSchema,
  deleteWatchlistCommandSchema,
  deleteWatchlistReceiptSchema,
  parseExecutionCommand,
  removeWatchlistProjectCommandSchema,
  removeWatchlistProjectReceiptSchema,
  renameWatchlistCommandSchema,
  renameWatchlistReceiptSchema,
  setParticipationStatusCommandSchema,
  setParticipationStatusReceiptSchema,
  updateTaskCommandSchema,
  updateTaskReceiptSchema,
  userProjectParticipationRowSchema,
  userTaskRowSchema,
  watchlistProjectRowSchema,
  watchlistRowSchema,
  type AddWatchlistProjectCommand,
  type CreateTaskCommand,
  type CreateWatchlistCommand,
  type DeleteTaskCommand,
  type DeleteWatchlistCommand,
  type RemoveWatchlistProjectCommand,
  type RenameWatchlistCommand,
  type SetParticipationStatusCommand,
  type UpdateTaskCommand,
} from '@airdrop/contracts';
import type {
  ExecutionParticipationRepository,
  ExecutionTaskRepository,
  ExecutionWatchlistRepository,
} from '@airdrop/database';
import { z } from 'zod';

import type { AuthenticatedUserVerifier } from './authenticated-user.js';

export type ExecutionHandlerDependencies = {
  readonly auth: AuthenticatedUserVerifier;
  readonly tasks: ExecutionTaskRepository;
  readonly watchlists: ExecutionWatchlistRepository;
  readonly participation: ExecutionParticipationRepository;
  readonly ids: { generate(): string };
};

type IdContext = { params: Promise<Record<string, string>> };
type Authentication =
  | { readonly kind: 'verified'; readonly accessToken: string }
  | { readonly kind: 'no_session' }
  | { readonly kind: 'failed' };
type ExecutionCommand =
  | CreateTaskCommand
  | UpdateTaskCommand
  | DeleteTaskCommand
  | CreateWatchlistCommand
  | RenameWatchlistCommand
  | DeleteWatchlistCommand
  | AddWatchlistProjectCommand
  | RemoveWatchlistProjectCommand
  | SetParticipationStatusCommand;

const uuidSchema = z.uuid();
const taskListResponseSchema = createApiSuccessSchema(z.array(userTaskRowSchema));
const createTaskResponseSchema = createApiSuccessSchema(createTaskReceiptSchema);
const updateTaskResponseSchema = createApiSuccessSchema(updateTaskReceiptSchema);
const deleteTaskResponseSchema = createApiSuccessSchema(deleteTaskReceiptSchema);
const watchlistListResponseSchema = createApiSuccessSchema(z.array(watchlistRowSchema));
const createWatchlistResponseSchema = createApiSuccessSchema(createWatchlistReceiptSchema);
const renameWatchlistResponseSchema = createApiSuccessSchema(renameWatchlistReceiptSchema);
const deleteWatchlistResponseSchema = createApiSuccessSchema(deleteWatchlistReceiptSchema);
const watchlistProjectListResponseSchema = createApiSuccessSchema(
  z.array(watchlistProjectRowSchema),
);
const addWatchlistProjectResponseSchema = createApiSuccessSchema(
  addWatchlistProjectReceiptSchema,
);
const removeWatchlistProjectResponseSchema = createApiSuccessSchema(
  removeWatchlistProjectReceiptSchema,
);
const participationResponseSchema = createApiSuccessSchema(userProjectParticipationRowSchema);
const setParticipationResponseSchema = createApiSuccessSchema(
  setParticipationStatusReceiptSchema,
);

export function createExecutionTaskHandler(
  deps: Pick<ExecutionHandlerDependencies, 'auth' | 'tasks' | 'ids'>,
) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const authentication = await authenticate(request, deps.auth);
    if (authentication.kind !== 'verified') {
      return privateAuthenticationFailure(authentication, request.method, requestId);
    }
    const token = authentication.accessToken;
    if (hasQueryParameters(request)) return errorResponse(400, 'invalid_request', requestId);

    if (request.method === 'GET') {
      try {
        return successResponse(
          taskListResponseSchema,
          await deps.tasks.listMine({ accessToken: token }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'query');
      }
    }

    if (request.method === 'POST') {
      const command = await parseCommand(request, createTaskCommandSchema);
      if (command === null || !hasMatchingIdempotencyKey(request, command)) {
        return errorResponse(400, 'invalid_request', requestId);
      }
      try {
        return successResponse(
          createTaskResponseSchema,
          await deps.tasks.create({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    return errorResponse(400, 'invalid_request', requestId);
  };
}

export function createExecutionTaskItemHandler(
  deps: Pick<ExecutionHandlerDependencies, 'auth' | 'tasks' | 'ids'>,
) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate();
    const authentication = await authenticate(request, deps.auth);
    if (authentication.kind !== 'verified') {
      return privateAuthenticationFailure(authentication, request.method, requestId);
    }
    const token = authentication.accessToken;
    if (hasQueryParameters(request)) return errorResponse(400, 'invalid_request', requestId);
    const id = uuidSchema.safeParse((await context.params).id);
    if (!id.success) return errorResponse(400, 'invalid_request', requestId);

    if (request.method === 'PATCH') {
      const command = await parseCommand(request, updateTaskCommandSchema);
      if (
        command === null
        || !hasMatchingIdempotencyKey(request, command)
        || command.taskId !== id.data
      ) return errorResponse(400, 'invalid_request', requestId);
      try {
        return successResponse(
          updateTaskResponseSchema,
          await deps.tasks.update({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    if (request.method === 'DELETE') {
      const command = await parseCommand(request, deleteTaskCommandSchema);
      if (
        command === null
        || !hasMatchingIdempotencyKey(request, command)
        || command.taskId !== id.data
      ) return errorResponse(400, 'invalid_request', requestId);
      try {
        return successResponse(
          deleteTaskResponseSchema,
          await deps.tasks.remove({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    return errorResponse(400, 'invalid_request', requestId);
  };
}

export function createExecutionWatchlistHandler(
  deps: Pick<ExecutionHandlerDependencies, 'auth' | 'watchlists' | 'ids'>,
) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const authentication = await authenticate(request, deps.auth);
    if (authentication.kind !== 'verified') {
      return privateAuthenticationFailure(authentication, request.method, requestId);
    }
    const token = authentication.accessToken;
    if (hasQueryParameters(request)) return errorResponse(400, 'invalid_request', requestId);

    if (request.method === 'GET') {
      try {
        return successResponse(
          watchlistListResponseSchema,
          await deps.watchlists.listMine({ accessToken: token }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'query');
      }
    }

    if (request.method === 'POST') {
      const command = await parseCommand(request, createWatchlistCommandSchema);
      if (command === null || !hasMatchingIdempotencyKey(request, command)) {
        return errorResponse(400, 'invalid_request', requestId);
      }
      try {
        return successResponse(
          createWatchlistResponseSchema,
          await deps.watchlists.create({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    return errorResponse(400, 'invalid_request', requestId);
  };
}

export function createExecutionWatchlistItemHandler(
  deps: Pick<ExecutionHandlerDependencies, 'auth' | 'watchlists' | 'ids'>,
) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate();
    const authentication = await authenticate(request, deps.auth);
    if (authentication.kind !== 'verified') {
      return privateAuthenticationFailure(authentication, request.method, requestId);
    }
    const token = authentication.accessToken;
    if (hasQueryParameters(request)) return errorResponse(400, 'invalid_request', requestId);
    const id = uuidSchema.safeParse((await context.params).id);
    if (!id.success) return errorResponse(400, 'invalid_request', requestId);

    if (request.method === 'GET') {
      try {
        return successResponse(
          watchlistProjectListResponseSchema,
          await deps.watchlists.listProjects({ accessToken: token, watchlistId: id.data }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'query');
      }
    }

    if (request.method === 'PATCH') {
      const command = await parseCommand(request, renameWatchlistCommandSchema);
      if (
        command === null
        || !hasMatchingIdempotencyKey(request, command)
        || command.watchlistId !== id.data
      ) return errorResponse(400, 'invalid_request', requestId);
      try {
        return successResponse(
          renameWatchlistResponseSchema,
          await deps.watchlists.rename({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    if (request.method === 'DELETE') {
      const command = await parseCommand(request, deleteWatchlistCommandSchema);
      if (
        command === null
        || !hasMatchingIdempotencyKey(request, command)
        || command.watchlistId !== id.data
      ) return errorResponse(400, 'invalid_request', requestId);
      try {
        return successResponse(
          deleteWatchlistResponseSchema,
          await deps.watchlists.remove({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    return errorResponse(400, 'invalid_request', requestId);
  };
}

export function createExecutionWatchlistProjectHandler(
  deps: Pick<ExecutionHandlerDependencies, 'auth' | 'watchlists' | 'ids'>,
) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate();
    const authentication = await authenticate(request, deps.auth);
    if (authentication.kind !== 'verified') {
      return privateAuthenticationFailure(authentication, request.method, requestId);
    }
    const token = authentication.accessToken;
    if (hasQueryParameters(request)) return errorResponse(400, 'invalid_request', requestId);
    const resolved = await context.params;
    const watchlist = uuidSchema.safeParse(resolved.watchlistId);
    const project = uuidSchema.safeParse(resolved.projectId);
    if (!watchlist.success || !project.success) {
      return errorResponse(400, 'invalid_request', requestId);
    }

    if (request.method === 'PUT') {
      const command = await parseCommand(request, addWatchlistProjectCommandSchema);
      if (
        command === null
        || !hasMatchingIdempotencyKey(request, command)
        || command.watchlistId !== watchlist.data
        || command.projectId !== project.data
      ) return errorResponse(400, 'invalid_request', requestId);
      try {
        return successResponse(
          addWatchlistProjectResponseSchema,
          await deps.watchlists.addProject({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    if (request.method === 'DELETE') {
      const command = await parseCommand(request, removeWatchlistProjectCommandSchema);
      if (
        command === null
        || !hasMatchingIdempotencyKey(request, command)
        || command.watchlistId !== watchlist.data
        || command.projectId !== project.data
      ) return errorResponse(400, 'invalid_request', requestId);
      try {
        return successResponse(
          removeWatchlistProjectResponseSchema,
          await deps.watchlists.removeProject({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    return errorResponse(400, 'invalid_request', requestId);
  };
}

export function createExecutionParticipationHandler(
  deps: Pick<ExecutionHandlerDependencies, 'auth' | 'participation' | 'ids'>,
) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate();
    const authentication = await authenticate(request, deps.auth);
    if (authentication.kind !== 'verified') {
      return privateAuthenticationFailure(authentication, request.method, requestId);
    }
    const token = authentication.accessToken;
    if (hasQueryParameters(request)) return errorResponse(400, 'invalid_request', requestId);
    const project = uuidSchema.safeParse((await context.params).projectId);
    if (!project.success) return errorResponse(400, 'invalid_request', requestId);

    if (request.method === 'GET') {
      try {
        return successResponse(
          participationResponseSchema,
          await deps.participation.getMine({
            accessToken: token,
            projectId: project.data,
          }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'query');
      }
    }

    if (request.method === 'PUT') {
      const command = await parseCommand(request, setParticipationStatusCommandSchema);
      if (
        command === null
        || !hasMatchingIdempotencyKey(request, command)
        || command.projectId !== project.data
      ) return errorResponse(400, 'invalid_request', requestId);
      try {
        return successResponse(
          setParticipationResponseSchema,
          await deps.participation.set({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    return errorResponse(400, 'invalid_request', requestId);
  };
}

async function authenticate(
  request: Request,
  auth: AuthenticatedUserVerifier,
): Promise<Authentication> {
  const authorization = request.headers.get('authorization');
  try {
    const user = await auth.verifyAuthorizationHeader(authorization);
    const accessToken = bearerToken(authorization);
    return user === null || accessToken === null
      ? { kind: 'no_session' }
      : { kind: 'verified', accessToken };
  } catch {
    return { kind: 'failed' };
  }
}

function privateAuthenticationFailure(
  authentication: Exclude<Authentication, { readonly kind: 'verified' }>,
  method: string,
  requestId: string,
): Response {
  if (authentication.kind === 'no_session') {
    return errorResponse(401, 'execution_session_required', requestId);
  }
  return errorResponse(
    500,
    method === 'GET' ? 'execution_query_failed' : 'execution_persistence_failed',
    requestId,
  );
}

function bearerToken(value: string | null): string | null {
  if (value === null) return null;
  return /^Bearer ([^\s]+)$/.exec(value)?.[1] ?? null;
}

function hasQueryParameters(request: Request): boolean {
  return new URL(request.url).search.length > 0;
}

async function parseCommand<T extends ExecutionCommand>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    return parseExecutionCommand(schema as never, await request.json()) as T;
  } catch {
    return null;
  }
}

function hasMatchingIdempotencyKey(request: Request, command: ExecutionCommand): boolean {
  const header = request.headers.get('idempotency-key');
  return validIdempotencyKey(header) && header === command.idempotencyKey;
}

function validIdempotencyKey(value: string | null): value is string {
  return value !== null
    && value === value.trim()
    && Array.from(value).length >= 1
    && Array.from(value).length <= 255
    && isPostgresText(value);
}

function isPostgresText(value: string): boolean {
  if (value.includes('\u0000')) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function successResponse<T extends z.ZodType>(schema: T, data: unknown, requestId: string): Response {
  return Response.json(schema.parse({
    ok: true,
    data,
    meta: { requestId, nextCursor: null },
  }));
}

// A resource that is not the caller's own is reported as not found rather than
// forbidden, so the API never confirms that it exists.
const notFoundCodes: readonly string[] = [
  'execution_task_not_found',
  'execution_watchlist_not_found',
  'execution_project_not_found',
];
const conflictCodes: readonly string[] = [
  'execution_version_conflict',
  'execution_idempotency_conflict',
  'execution_name_conflict',
  'execution_task_limit_reached',
  'execution_watchlist_limit_reached',
  'execution_watchlist_project_limit_reached',
];

function repositoryError(
  error: unknown,
  requestId: string,
  kind: 'query' | 'mutation',
): Response {
  const code = errorCode(error);
  if (code === 'execution_session_required') return errorResponse(401, code, requestId);
  if (code !== undefined && notFoundCodes.includes(code)) {
    return errorResponse(404, code, requestId);
  }
  if (code === 'execution_command_invalid') return errorResponse(400, code, requestId);
  if (code !== undefined && conflictCodes.includes(code)) {
    return errorResponse(409, code, requestId);
  }
  return errorResponse(
    500,
    kind === 'query' ? 'execution_query_failed' : 'execution_persistence_failed',
    requestId,
  );
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
  return Response.json(apiErrorSchema.parse({
    ok: false,
    error: { code, message: messageFor(code), requestId, details: null },
  }), { status });
}

function messageFor(code: string): string {
  switch (code) {
    case 'execution_session_required': return 'An active session is required.';
    case 'execution_task_not_found': return 'The task was not found.';
    case 'execution_watchlist_not_found': return 'The watchlist was not found.';
    case 'execution_project_not_found': return 'The project was not found.';
    case 'execution_task_limit_reached': return 'The task limit has been reached.';
    case 'execution_watchlist_limit_reached': return 'The watchlist limit has been reached.';
    case 'execution_watchlist_project_limit_reached':
      return 'The watchlist project limit has been reached.';
    case 'execution_name_conflict': return 'A watchlist with that name already exists.';
    case 'execution_version_conflict': return 'The execution record has changed.';
    case 'execution_idempotency_conflict':
      return 'The idempotency key conflicts with a prior execution command.';
    case 'execution_command_invalid': return 'The execution command is invalid.';
    case 'execution_query_failed': return 'Execution records could not be loaded.';
    case 'execution_persistence_failed': return 'The execution command could not be persisted.';
    default: return 'The request is invalid.';
  }
}
