import { z } from 'zod';

import {
  findForbiddenExecutionKeys,
  participationNotesSchema,
  participationStatusSchema,
  taskPrioritySchema,
  taskStatusSchema,
  taskTitleSchema,
  watchlistNameSchema,
} from './enums.js';

// Every command is strict and carries both an idempotency key and the
// aggregate version it was built against, so a stale form can never silently
// overwrite a newer state.

const executionCommandEnvelope = {
  idempotencyKey: z.string().trim().min(8).max(200),
  expectedVersion: z.number().int().min(1),
};

export const createTaskCommandSchema = z.strictObject({
  ...executionCommandEnvelope,
  projectId: z.uuid().nullable(),
  title: taskTitleSchema,
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueAt: z.iso.datetime().nullable(),
});

/**
 * Completion is a pair of fields, not one: the schema keeps the invariant the
 * database enforces — `(status = 'completed') = (completed_at is not null)` —
 * so a client can never write a half-finished completion.
 */
export const updateTaskCommandSchema = z
  .strictObject({
    ...executionCommandEnvelope,
    taskId: z.uuid(),
    projectId: z.uuid().nullable(),
    title: taskTitleSchema.nullable(),
    status: taskStatusSchema.nullable(),
    priority: taskPrioritySchema.nullable(),
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .refine(
    (command) =>
      command.status === null
      || (command.status === 'completed') === (command.completedAt !== null),
    {
      message: "completedAt is required when status is completed and forbidden otherwise.",
    },
  )
  .refine(
    (command) =>
      command.projectId !== null
      || command.title !== null
      || command.status !== null
      || command.priority !== null
      || command.dueAt !== null
      || command.completedAt !== null,
    { message: 'An update must change at least one task field.' },
  );

export const deleteTaskCommandSchema = z.strictObject({
  ...executionCommandEnvelope,
  taskId: z.uuid(),
});

export const createWatchlistCommandSchema = z.strictObject({
  ...executionCommandEnvelope,
  name: watchlistNameSchema,
});

export const renameWatchlistCommandSchema = z.strictObject({
  ...executionCommandEnvelope,
  watchlistId: z.uuid(),
  name: watchlistNameSchema,
});

export const deleteWatchlistCommandSchema = z.strictObject({
  ...executionCommandEnvelope,
  watchlistId: z.uuid(),
});

export const addWatchlistProjectCommandSchema = z.strictObject({
  ...executionCommandEnvelope,
  watchlistId: z.uuid(),
  projectId: z.uuid(),
});

export const removeWatchlistProjectCommandSchema = z.strictObject({
  ...executionCommandEnvelope,
  watchlistId: z.uuid(),
  projectId: z.uuid(),
});

export const setParticipationStatusCommandSchema = z.strictObject({
  ...executionCommandEnvelope,
  projectId: z.uuid(),
  participationStatus: participationStatusSchema,
  notes: participationNotesSchema,
});

export type CreateTaskCommand = z.infer<typeof createTaskCommandSchema>;
export type UpdateTaskCommand = z.infer<typeof updateTaskCommandSchema>;
export type DeleteTaskCommand = z.infer<typeof deleteTaskCommandSchema>;
export type CreateWatchlistCommand = z.infer<typeof createWatchlistCommandSchema>;
export type RenameWatchlistCommand = z.infer<typeof renameWatchlistCommandSchema>;
export type DeleteWatchlistCommand = z.infer<typeof deleteWatchlistCommandSchema>;
export type AddWatchlistProjectCommand = z.infer<typeof addWatchlistProjectCommandSchema>;
export type RemoveWatchlistProjectCommand = z.infer<typeof removeWatchlistProjectCommandSchema>;
export type SetParticipationStatusCommand = z.infer<typeof setParticipationStatusCommandSchema>;

/**
 * Rejects any command that carries a key-like field outright. This is the
 * contract-level half of the platform rule: execution rows are private notes
 * about public opportunities, so nothing resembling a wallet secret may ever
 * reach them.
 */
export function parseExecutionCommand<TSchema extends z.ZodType>(
  schema: TSchema,
  payload: unknown,
): z.infer<TSchema> {
  const forbidden = findForbiddenExecutionKeys(payload);
  if (forbidden.length > 0) {
    throw new ExecutionForbiddenFieldError(forbidden);
  }
  return schema.parse(payload);
}

export class ExecutionForbiddenFieldError extends Error {
  readonly code = 'execution_command_invalid' as const;

  constructor(readonly fields: readonly string[]) {
    super('Execution commands must never carry secret-like fields.');
    this.name = 'ExecutionForbiddenFieldError';
  }
}
