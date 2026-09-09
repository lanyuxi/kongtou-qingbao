import {
  createTaskCommandSchema,
  createTaskReceiptSchema,
  deleteTaskCommandSchema,
  deleteTaskReceiptSchema,
  parseExecutionCommand,
  updateTaskCommandSchema,
  updateTaskReceiptSchema,
  userTaskRowSchema,
  type CreateTaskCommand,
  type CreateTaskReceipt,
  type DeleteTaskCommand,
  type DeleteTaskReceipt,
  type UpdateTaskCommand,
  type UpdateTaskReceipt,
  type UserTaskRow,
} from '@airdrop/contracts';

import {
  createBrowserExecutionRpc,
  ExecutionRepositoryError,
  mutate,
  read,
  requireAccessToken,
  type ExecutionRepositoryOptions,
  type ExecutionRpc,
} from './shared.js';

export interface ExecutionTaskRepository {
  listMine(input: { accessToken: string }): Promise<readonly UserTaskRow[]>;
  create(input: {
    accessToken: string;
    command: CreateTaskCommand;
  }): Promise<CreateTaskReceipt>;
  update(input: {
    accessToken: string;
    command: UpdateTaskCommand;
  }): Promise<UpdateTaskReceipt>;
  remove(input: {
    accessToken: string;
    command: DeleteTaskCommand;
  }): Promise<DeleteTaskReceipt>;
}
export function createExecutionTaskRepository(
  options: ExecutionRepositoryOptions,
): ExecutionTaskRepository {
  return createExecutionTaskRepositoryFromRpc(createBrowserExecutionRpc(options));
}
export function createExecutionTaskRepositoryFromRpc(
  rpc: ExecutionRpc,
): ExecutionTaskRepository {
  return {
    listMine: async (input) =>
      read(async () =>
        parseTaskRows(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'list_my_execution_tasks',
            args: {},
          }),
        ),
      ),
    create: async (input) =>
      mutate(async () =>
        createTaskReceiptSchema.parse(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'submit_create_task',
            args: { p_payload: parseCommand(createTaskCommandSchema, input.command) },
          }),
        ),
      ),
    update: async (input) =>
      mutate(async () =>
        updateTaskReceiptSchema.parse(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'submit_update_task',
            args: { p_payload: parseCommand(updateTaskCommandSchema, input.command) },
          }),
        ),
      ),
    remove: async (input) =>
      mutate(async () =>
        deleteTaskReceiptSchema.parse(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'submit_delete_task',
            args: { p_payload: parseCommand(deleteTaskCommandSchema, input.command) },
          }),
        ),
      ),
  };
}

function parseTaskRows(value: unknown): readonly UserTaskRow[] {
  if (!Array.isArray(value)) throw new TypeError('execution_rpc_array_expected');
  return value.map((row) => userTaskRowSchema.parse(row));
}

function parseCommand<TSchema extends { parse(value: unknown): unknown }>(
  schema: TSchema,
  value: unknown,
): unknown {
  try {
    parseExecutionCommand(schema as never, value);
    return value;
  } catch {
    throw new ExecutionRepositoryError('execution_command_invalid');
  }
}
