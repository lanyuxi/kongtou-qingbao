import {
  parseExecutionCommand,
  setParticipationStatusCommandSchema,
  setParticipationStatusReceiptSchema,
  userProjectParticipationRowSchema,
  type SetParticipationStatusCommand,
  type SetParticipationStatusReceipt,
  type UserProjectParticipationRow,
} from '@airdrop/contracts';

import {
  createBrowserExecutionRpc,
  ExecutionRepositoryError,
  exactSingleRow,
  mutate,
  read,
  requireAccessToken,
  type ExecutionRepositoryOptions,
  type ExecutionRpc,
} from './shared.js';

export interface ExecutionParticipationRepository {
  getMine(input: {
    accessToken: string;
    projectId: string;
  }): Promise<UserProjectParticipationRow>;
  set(input: {
    accessToken: string;
    command: SetParticipationStatusCommand;
  }): Promise<SetParticipationStatusReceipt>;
}
export function createExecutionParticipationRepository(
  options: ExecutionRepositoryOptions,
): ExecutionParticipationRepository {
  return createExecutionParticipationRepositoryFromRpc(createBrowserExecutionRpc(options));
}
export function createExecutionParticipationRepositoryFromRpc(
  rpc: ExecutionRpc,
): ExecutionParticipationRepository {
  return {
    getMine: async (input) =>
      read(async () =>
        userProjectParticipationRowSchema.parse(
          exactSingleRow(
            await rpc.invoke({
              accessToken: requireAccessToken(input.accessToken),
              functionName: 'get_my_participation',
              args: { p_project_id: input.projectId },
            }),
            'execution_project_not_found',
          ),
        ),
      ),
    set: async (input) =>
      mutate(async () =>
        setParticipationStatusReceiptSchema.parse(
          await rpc.invoke({
            accessToken: requireAccessToken(input.accessToken),
            functionName: 'submit_set_participation_status',
            args: {
              p_payload: parseCommand(setParticipationStatusCommandSchema, input.command),
            },
          }),
        ),
      ),
  };
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
