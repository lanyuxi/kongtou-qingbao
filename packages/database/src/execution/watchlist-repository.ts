import {
  addWatchlistProjectCommandSchema,
  addWatchlistProjectReceiptSchema,
  createWatchlistCommandSchema,
  createWatchlistReceiptSchema,
  deleteWatchlistCommandSchema,
  deleteWatchlistReceiptSchema,
  parseExecutionCommand,
  removeWatchlistProjectCommandSchema,
  removeWatchlistProjectReceiptSchema,
  renameWatchlistCommandSchema,
  renameWatchlistReceiptSchema,
  watchlistProjectRowSchema,
  watchlistRowSchema,
  type AddWatchlistProjectCommand,
  type AddWatchlistProjectReceipt,
  type CreateWatchlistCommand,
  type CreateWatchlistReceipt,
  type DeleteWatchlistCommand,
  type DeleteWatchlistReceipt,
  type RemoveWatchlistProjectCommand,
  type RemoveWatchlistProjectReceipt,
  type RenameWatchlistCommand,
  type RenameWatchlistReceipt,
  type WatchlistProjectRow,
  type WatchlistRow,
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

export interface ExecutionWatchlistRepository {
  listMine(input: { accessToken: string }): Promise<readonly WatchlistRow[]>;
  listProjects(input: {
    accessToken: string;
    watchlistId: string;
  }): Promise<readonly WatchlistProjectRow[]>;
  create(input: {
    accessToken: string;
    command: CreateWatchlistCommand;
  }): Promise<CreateWatchlistReceipt>;
  rename(input: {
    accessToken: string;
    command: RenameWatchlistCommand;
  }): Promise<RenameWatchlistReceipt>;
  remove(input: {
    accessToken: string;
    command: DeleteWatchlistCommand;
  }): Promise<DeleteWatchlistReceipt>;
  addProject(input: {
    accessToken: string;
    command: AddWatchlistProjectCommand;
  }): Promise<AddWatchlistProjectReceipt>;
  removeProject(input: {
    accessToken: string;
    command: RemoveWatchlistProjectCommand;
  }): Promise<RemoveWatchlistProjectReceipt>;
}
export function createExecutionWatchlistRepository(
  options: ExecutionRepositoryOptions,
): ExecutionWatchlistRepository {
  return createExecutionWatchlistRepositoryFromRpc(createBrowserExecutionRpc(options));
}
export function createExecutionWatchlistRepositoryFromRpc(
  rpc: ExecutionRpc,
): ExecutionWatchlistRepository {
  return {
    listMine: async (input) =>
      read(async () =>
        parseRows(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'list_my_watchlists',
            args: {},
          }),
          watchlistRowSchema,
        ),
      ),
    listProjects: async (input) =>
      read(async () =>
        parseRows(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'list_my_watchlist_projects',
            args: { p_watchlist_id: input.watchlistId },
          }),
          watchlistProjectRowSchema,
        ),
      ),
    create: async (input) =>
      mutate(async () =>
        createWatchlistReceiptSchema.parse(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'submit_create_watchlist',
            args: { p_payload: parseCommand(createWatchlistCommandSchema, input.command) },
          }),
        ),
      ),
    rename: async (input) =>
      mutate(async () =>
        renameWatchlistReceiptSchema.parse(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'submit_rename_watchlist',
            args: { p_payload: parseCommand(renameWatchlistCommandSchema, input.command) },
          }),
        ),
      ),
    remove: async (input) =>
      mutate(async () =>
        deleteWatchlistReceiptSchema.parse(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'submit_delete_watchlist',
            args: { p_payload: parseCommand(deleteWatchlistCommandSchema, input.command) },
          }),
        ),
      ),
    addProject: async (input) =>
      mutate(async () =>
        addWatchlistProjectReceiptSchema.parse(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'submit_add_watchlist_project',
            args: {
              p_payload: parseCommand(addWatchlistProjectCommandSchema, input.command),
            },
          }),
        ),
      ),
    removeProject: async (input) =>
      mutate(async () =>
        removeWatchlistProjectReceiptSchema.parse(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'submit_remove_watchlist_project',
            args: {
              p_payload: parseCommand(removeWatchlistProjectCommandSchema, input.command),
            },
          }),
        ),
      ),
  };
}

function parseRows<T>(
  value: unknown,
  schema: { parse(value: unknown): T },
): readonly T[] {
  if (!Array.isArray(value)) throw new TypeError('execution_rpc_array_expected');
  return value.map((row) => schema.parse(row));
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
