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
  executionErrorCodeSchema,
  parseExecutionCommand,
  removeWatchlistProjectCommandSchema,
  removeWatchlistProjectReceiptSchema,
  renameWatchlistCommandSchema,
  renameWatchlistReceiptSchema,
  setParticipationStatusCommandSchema,
  setParticipationStatusReceiptSchema,
  updateTaskCommandSchema,
  updateTaskPatchSchema,
  updateTaskReceiptSchema,
  userProjectParticipationRowSchema,
  userTaskRowSchema,
  watchlistProjectRowSchema,
  watchlistRowSchema,
  type AddWatchlistProjectReceipt,
  type CreateTaskReceipt,
  type CreateWatchlistReceipt,
  type DeleteTaskReceipt,
  type DeleteWatchlistReceipt,
  type ExecutionErrorCode,
  type RemoveWatchlistProjectReceipt,
  type RenameWatchlistReceipt,
  type SetParticipationStatusReceipt,
  type UpdateTaskReceipt,
  type UserProjectParticipationRow,
  type UserTaskRow,
  type WatchlistProjectRow,
  type WatchlistRow,
} from '@airdrop/contracts';
import { z } from 'zod';

const taskListResponseSchema = createApiSuccessSchema(z.array(userTaskRowSchema));
const createTaskResponseSchema = createApiSuccessSchema(createTaskReceiptSchema);
const updateTaskResponseSchema = createApiSuccessSchema(updateTaskReceiptSchema);
const deleteTaskResponseSchema = createApiSuccessSchema(deleteTaskReceiptSchema);
const watchlistListResponseSchema = createApiSuccessSchema(z.array(watchlistRowSchema));
const watchlistProjectListResponseSchema = createApiSuccessSchema(
  z.array(watchlistProjectRowSchema),
);
const createWatchlistResponseSchema = createApiSuccessSchema(createWatchlistReceiptSchema);
const renameWatchlistResponseSchema = createApiSuccessSchema(renameWatchlistReceiptSchema);
const deleteWatchlistResponseSchema = createApiSuccessSchema(deleteWatchlistReceiptSchema);
const addWatchlistProjectResponseSchema = createApiSuccessSchema(
  addWatchlistProjectReceiptSchema,
);
const removeWatchlistProjectResponseSchema = createApiSuccessSchema(
  removeWatchlistProjectReceiptSchema,
);
const participationResponseSchema = createApiSuccessSchema(
  userProjectParticipationRowSchema,
);
const setParticipationResponseSchema = createApiSuccessSchema(
  setParticipationStatusReceiptSchema,
);

// A creation draft has no version to state yet: both envelope fields are
// supplied here, so the draft schemas omit them and the command builders add
// them back. Validating a draft against the full envelope schema would reject
// every creation before it ever left the browser.
const createTaskDraftSchema = createTaskCommandSchema.omit({
  idempotencyKey: true,
  expectedVersion: true,
});
const updateTaskInputSchema = updateTaskPatchSchema;
const deleteTaskInputSchema = deleteTaskCommandSchema.omit({ idempotencyKey: true });
const createWatchlistDraftSchema = createWatchlistCommandSchema.omit({
  idempotencyKey: true,
  expectedVersion: true,
});
const renameWatchlistInputSchema = renameWatchlistCommandSchema.omit({ idempotencyKey: true });
const deleteWatchlistInputSchema = deleteWatchlistCommandSchema.omit({ idempotencyKey: true });
const addWatchlistProjectInputSchema = addWatchlistProjectCommandSchema.omit({
  idempotencyKey: true,
});
const removeWatchlistProjectInputSchema = removeWatchlistProjectCommandSchema.omit({
  idempotencyKey: true,
});
const setParticipationInputSchema = setParticipationStatusCommandSchema.omit({
  idempotencyKey: true,
});

export type ExecutionApiFailure = {
  readonly ok: false;
  readonly code: ExecutionErrorCode;
};

export type ExecutionApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | ExecutionApiFailure;

type ExecutionRequestOperation =
  | 'task_list_query'
  | 'task_create'
  | 'task_update'
  | 'task_remove'
  | 'watchlist_list_query'
  | 'watchlist_project_list_query'
  | 'watchlist_create'
  | 'watchlist_rename'
  | 'watchlist_remove'
  | 'watchlist_project_add'
  | 'watchlist_project_remove'
  | 'participation_query'
  | 'participation_set';

export interface ExecutionSessionPort {
  getAccessToken(): Promise<string | null>;
}

export interface ExecutionApiClientDependencies {
  readonly session: ExecutionSessionPort;
  readonly fetch: typeof globalThis.fetch;
  readonly ids: { generate(): string };
}

export interface ExecutionTaskCreateInput {
  readonly projectId: string | null;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly dueAt: string | null;
}

export interface ExecutionTaskUpdateInput {
  readonly taskId: string;
  readonly expectedVersion: number;
  readonly projectId: string | null;
  readonly title: string | null;
  readonly status: string | null;
  readonly priority: string | null;
  readonly dueAt: string | null;
  readonly completedAt: string | null;
}

export interface ExecutionTaskRemoveInput {
  readonly taskId: string;
  readonly expectedVersion: number;
}

export interface ExecutionWatchlistCreateInput {
  readonly name: string;
}

export interface ExecutionWatchlistRenameInput {
  readonly watchlistId: string;
  readonly expectedVersion: number;
  readonly name: string;
}

export interface ExecutionWatchlistRemoveInput {
  readonly watchlistId: string;
  readonly expectedVersion: number;
}

export interface ExecutionWatchlistListProjectsInput {
  readonly watchlistId: string;
}

export interface ExecutionWatchlistProjectInput {
  readonly watchlistId: string;
  readonly expectedVersion: number;
  readonly projectId: string;
}

export interface ExecutionParticipationQueryInput {
  readonly projectId: string;
}

export interface ExecutionParticipationSetInput {
  readonly projectId: string;
  readonly expectedVersion: number;
  readonly participationStatus: string;
  readonly notes: string | null;
}

export interface ExecutionApiClient {
  listTasks(): Promise<ExecutionApiResult<readonly UserTaskRow[]>>;
  createTask(input: ExecutionTaskCreateInput): Promise<ExecutionApiResult<CreateTaskReceipt>>;
  updateTask(input: ExecutionTaskUpdateInput): Promise<ExecutionApiResult<UpdateTaskReceipt>>;
  removeTask(input: ExecutionTaskRemoveInput): Promise<ExecutionApiResult<DeleteTaskReceipt>>;
  listWatchlists(): Promise<ExecutionApiResult<readonly WatchlistRow[]>>;
  listWatchlistProjects(
    input: ExecutionWatchlistListProjectsInput,
  ): Promise<ExecutionApiResult<readonly WatchlistProjectRow[]>>;
  createWatchlist(
    input: ExecutionWatchlistCreateInput,
  ): Promise<ExecutionApiResult<CreateWatchlistReceipt>>;
  renameWatchlist(
    input: ExecutionWatchlistRenameInput,
  ): Promise<ExecutionApiResult<RenameWatchlistReceipt>>;
  removeWatchlist(
    input: ExecutionWatchlistRemoveInput,
  ): Promise<ExecutionApiResult<DeleteWatchlistReceipt>>;
  addWatchlistProject(
    input: ExecutionWatchlistProjectInput,
  ): Promise<ExecutionApiResult<AddWatchlistProjectReceipt>>;
  removeWatchlistProject(
    input: ExecutionWatchlistProjectInput,
  ): Promise<ExecutionApiResult<RemoveWatchlistProjectReceipt>>;
  getParticipation(
    input: ExecutionParticipationQueryInput,
  ): Promise<ExecutionApiResult<UserProjectParticipationRow>>;
  setParticipation(
    input: ExecutionParticipationSetInput,
  ): Promise<ExecutionApiResult<SetParticipationStatusReceipt>>;
}

/**
 * Creation happens against a state that does not exist yet, so the command
 * envelope always travels with version 1 — the same value the database stamps
 * into the receipt. A creation carries no other meaningful version.
 */
const freshRowVersion = 1;

export function createExecutionApiClient(deps: ExecutionApiClientDependencies): ExecutionApiClient {
  return {
    listTasks: () => query(deps, '/api/v1/execution/tasks', taskListResponseSchema, 'task_list_query'),
    createTask: (input) => mutation(
      deps,
      '/api/v1/execution/tasks',
      'POST',
      input,
      (rawInput) => parseExecutionCommand(createTaskDraftSchema, rawInput),
      (idempotencyKey) => parseExecutionCommand(createTaskCommandSchema, {
        ...input,
        expectedVersion: freshRowVersion,
        idempotencyKey,
      }),
      createTaskResponseSchema,
      'task_create',
    ),
    updateTask: (input) => mutation(
      deps,
      `/api/v1/execution/tasks/${input.taskId}`,
      'PATCH',
      input,
      (rawInput) => parseExecutionCommand(updateTaskInputSchema, rawInput),
      (idempotencyKey) => parseExecutionCommand(updateTaskCommandSchema, {
        ...input,
        idempotencyKey,
      }),
      updateTaskResponseSchema,
      'task_update',
    ),
    removeTask: (input) => mutation(
      deps,
      `/api/v1/execution/tasks/${input.taskId}`,
      'DELETE',
      input,
      (rawInput) => parseExecutionCommand(deleteTaskInputSchema, rawInput),
      (idempotencyKey) => parseExecutionCommand(deleteTaskCommandSchema, {
        ...input,
        idempotencyKey,
      }),
      deleteTaskResponseSchema,
      'task_remove',
    ),
    listWatchlists: () => query(
      deps,
      '/api/v1/execution/watchlists',
      watchlistListResponseSchema,
      'watchlist_list_query',
    ),
    listWatchlistProjects: (input) => query(
      deps,
      `/api/v1/execution/watchlists/${input.watchlistId}`,
      watchlistProjectListResponseSchema,
      'watchlist_project_list_query',
    ),
    createWatchlist: (input) => mutation(
      deps,
      '/api/v1/execution/watchlists',
      'POST',
      input,
      (rawInput) => parseExecutionCommand(createWatchlistDraftSchema, rawInput),
      (idempotencyKey) => parseExecutionCommand(createWatchlistCommandSchema, {
        ...input,
        expectedVersion: freshRowVersion,
        idempotencyKey,
      }),
      createWatchlistResponseSchema,
      'watchlist_create',
    ),
    renameWatchlist: (input) => mutation(
      deps,
      `/api/v1/execution/watchlists/${input.watchlistId}`,
      'PATCH',
      input,
      (rawInput) => parseExecutionCommand(renameWatchlistInputSchema, rawInput),
      (idempotencyKey) => parseExecutionCommand(renameWatchlistCommandSchema, {
        ...input,
        idempotencyKey,
      }),
      renameWatchlistResponseSchema,
      'watchlist_rename',
    ),
    removeWatchlist: (input) => mutation(
      deps,
      `/api/v1/execution/watchlists/${input.watchlistId}`,
      'DELETE',
      input,
      (rawInput) => parseExecutionCommand(deleteWatchlistInputSchema, rawInput),
      (idempotencyKey) => parseExecutionCommand(deleteWatchlistCommandSchema, {
        ...input,
        idempotencyKey,
      }),
      deleteWatchlistResponseSchema,
      'watchlist_remove',
    ),
    addWatchlistProject: (input) => mutation(
      deps,
      `/api/v1/execution/watchlists/${input.watchlistId}/projects/${input.projectId}`,
      'PUT',
      input,
      (rawInput) => parseExecutionCommand(addWatchlistProjectInputSchema, rawInput),
      (idempotencyKey) => parseExecutionCommand(addWatchlistProjectCommandSchema, {
        ...input,
        idempotencyKey,
      }),
      addWatchlistProjectResponseSchema,
      'watchlist_project_add',
    ),
    removeWatchlistProject: (input) => mutation(
      deps,
      `/api/v1/execution/watchlists/${input.watchlistId}/projects/${input.projectId}`,
      'DELETE',
      input,
      (rawInput) => parseExecutionCommand(removeWatchlistProjectInputSchema, rawInput),
      (idempotencyKey) => parseExecutionCommand(removeWatchlistProjectCommandSchema, {
        ...input,
        idempotencyKey,
      }),
      removeWatchlistProjectResponseSchema,
      'watchlist_project_remove',
    ),
    getParticipation: (input) => query(
      deps,
      `/api/v1/execution/projects/${input.projectId}/participation`,
      participationResponseSchema,
      'participation_query',
    ),
    setParticipation: (input) => mutation(
      deps,
      `/api/v1/execution/projects/${input.projectId}/participation`,
      'PUT',
      input,
      (rawInput) => parseExecutionCommand(setParticipationInputSchema, rawInput),
      (idempotencyKey) => parseExecutionCommand(setParticipationStatusCommandSchema, {
        ...input,
        idempotencyKey,
      }),
      setParticipationResponseSchema,
      'participation_set',
    ),
  };
}

async function query<T>(
  deps: ExecutionApiClientDependencies,
  input: string,
  schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>,
  operation: ExecutionRequestOperation,
): Promise<ExecutionApiResult<T>> {
  return request(deps, input, { method: 'GET' }, schema, 'execution_query_failed', operation);
}

// The command is validated before it is sent, so an unauthorised field never
// leaves the browser: the request is rejected here instead of at the database.
async function mutation<TCommand, T>(
  deps: ExecutionApiClientDependencies,
  input: string,
  method: 'PATCH' | 'POST' | 'DELETE' | 'PUT',
  untrustedInput: TCommand,
  parseRawInput: (input: TCommand) => unknown,
  parseCommand: (idempotencyKey: string) => unknown,
  schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>,
  operation: ExecutionRequestOperation,
): Promise<ExecutionApiResult<T>> {
  let idempotencyKey: string;
  let command: unknown;
  try {
    parseRawInput(untrustedInput);
    idempotencyKey = deps.ids.generate();
    command = parseCommand(idempotencyKey);
  } catch {
    return failure('execution_command_invalid');
  }

  return request(deps, input, {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(command),
  }, schema, 'execution_persistence_failed', operation);
}

async function request<T>(
  deps: ExecutionApiClientDependencies,
  input: string,
  init: RequestInit,
  schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>,
  fallbackCode: 'execution_query_failed' | 'execution_persistence_failed',
  operation: ExecutionRequestOperation,
): Promise<ExecutionApiResult<T>> {
  let accessToken: string | null;
  try {
    accessToken = await deps.session.getAccessToken();
  } catch {
    return failure('execution_session_required');
  }
  if (accessToken === null || !/^\S+$/u.test(accessToken)) {
    return failure('execution_session_required');
  }

  try {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${accessToken}`);
    const response = await deps.fetch(input, { ...init, headers });
    const payload: unknown = await response.json();
    if (response.status === 200) {
      const parsed = schema.safeParse(payload);
      return parsed.success
        ? { ok: true, data: parsed.data.data }
        : failure(fallbackCode);
    }
    const parsedError = apiErrorSchema.safeParse(payload);
    if (!parsedError.success) return failure(fallbackCode);
    const parsedCode = executionErrorCodeSchema.safeParse(parsedError.data.error.code);
    return parsedCode.success && isExpectedError(operation, response.status, parsedCode.data)
      ? failure(parsedCode.data)
      : failure(fallbackCode);
  } catch {
    return failure(fallbackCode);
  }
}

const notFoundCodes: readonly ExecutionErrorCode[] = [
  'execution_task_not_found',
  'execution_watchlist_not_found',
  'execution_project_not_found',
];
const conflictCodes: readonly ExecutionErrorCode[] = [
  'execution_version_conflict',
  'execution_idempotency_conflict',
  'execution_task_limit_reached',
  'execution_name_conflict',
  'execution_watchlist_limit_reached',
  'execution_watchlist_project_limit_reached',
];

function isExpectedError(
  operation: ExecutionRequestOperation,
  status: number,
  code: ExecutionErrorCode,
): boolean {
  if (status === 401) return code === 'execution_session_required';
  // Pure list queries never surface a specific failure code: they always
  // degrade to the query fallback instead.
  if (
    operation === 'task_list_query'
    || operation === 'watchlist_list_query'
    || operation === 'watchlist_project_list_query'
  ) return false;
  if (status === 404) return notFoundCodes.includes(code);
  if (status === 409) return conflictCodes.includes(code);
  return status === 400 && code === 'execution_command_invalid';
}

function failure(code: ExecutionErrorCode): ExecutionApiFailure {
  return { ok: false, code };
}
