import {
  apiErrorSchema,
  createApiSuccessSchema,
  createTaskCommandSchema,
  createTaskReceiptSchema,
  deleteTaskCommandSchema,
  deleteTaskReceiptSchema,
  executionErrorCodeSchema,
  parseExecutionCommand,
  updateTaskCommandSchema,
  updateTaskPatchSchema,
  updateTaskReceiptSchema,
  userTaskRowSchema,
  type CreateTaskReceipt,
  type DeleteTaskReceipt,
  type ExecutionErrorCode,
  type UpdateTaskReceipt,
  type UserTaskRow,
} from '@airdrop/contracts';
import { z } from 'zod';

const taskListResponseSchema = createApiSuccessSchema(z.array(userTaskRowSchema));
const createTaskResponseSchema = createApiSuccessSchema(createTaskReceiptSchema);
const updateTaskResponseSchema = createApiSuccessSchema(updateTaskReceiptSchema);
const deleteTaskResponseSchema = createApiSuccessSchema(deleteTaskReceiptSchema);

const createTaskInputSchema = createTaskCommandSchema.omit({ idempotencyKey: true });
const updateTaskInputSchema = updateTaskPatchSchema;
const deleteTaskInputSchema = deleteTaskCommandSchema.omit({ idempotencyKey: true });

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
  | 'task_remove';

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

export interface ExecutionApiClient {
  listTasks(): Promise<ExecutionApiResult<readonly UserTaskRow[]>>;
  createTask(input: ExecutionTaskCreateInput): Promise<ExecutionApiResult<CreateTaskReceipt>>;
  updateTask(input: ExecutionTaskUpdateInput): Promise<ExecutionApiResult<UpdateTaskReceipt>>;
  removeTask(input: ExecutionTaskRemoveInput): Promise<ExecutionApiResult<DeleteTaskReceipt>>;
}

export function createExecutionApiClient(deps: ExecutionApiClientDependencies): ExecutionApiClient {
  return {
    listTasks: () => query(deps, '/api/v1/execution/tasks', taskListResponseSchema, 'task_list_query'),
    createTask: (input) => mutation(
      deps,
      '/api/v1/execution/tasks',
      'POST',
      input,
      (rawInput) => parseExecutionCommand(createTaskInputSchema, rawInput),
      (idempotencyKey) => parseExecutionCommand(createTaskCommandSchema, {
        ...input,
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
  method: 'PATCH' | 'POST' | 'DELETE',
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

function isExpectedError(
  operation: ExecutionRequestOperation,
  status: number,
  code: ExecutionErrorCode,
): boolean {
  if (status === 401) return code === 'execution_session_required';
  if (operation === 'task_list_query') return false;
  if (status === 404) {
    return operation === 'task_create'
      ? code === 'execution_project_not_found'
      : code === 'execution_task_not_found' || code === 'execution_command_invalid';
  }
  if (status === 409) {
    const conflicts: readonly ExecutionErrorCode[] = [
      'execution_version_conflict',
      'execution_idempotency_conflict',
      'execution_task_limit_reached',
    ];
    return conflicts.includes(code);
  }
  return status === 400 && code === 'execution_command_invalid';
}

function failure(code: ExecutionErrorCode): ExecutionApiFailure {
  return { ok: false, code };
}
