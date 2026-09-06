import { z } from 'zod';

// Phase 10 Execution enums.
//
// The task state, priority and participation enums already exist in the shared
// contract enums module and mirror the database types exactly. They are
// re-exported here rather than redeclared: two copies of the same literal list
// that happen to agree today are not agreement, and they would drift.
export {
  participationStatusSchema,
  taskPrioritySchema,
  taskStatusSchema,
  type ParticipationStatus,
  type TaskPriority,
  type TaskStatus,
} from '../enums.js';

export const executionErrorCodeSchema = z.enum([
  'execution_session_required',
  'execution_task_not_found',
  'execution_watchlist_not_found',
  'execution_project_not_found',
  'execution_task_limit_reached',
  'execution_watchlist_limit_reached',
  'execution_watchlist_project_limit_reached',
  'execution_name_conflict',
  'execution_version_conflict',
  'execution_idempotency_conflict',
  'execution_command_invalid',
  'execution_query_failed',
  'execution_persistence_failed',
]);

export type ExecutionErrorCode = z.infer<typeof executionErrorCodeSchema>;

/**
 * Rejects control characters by code point. A literal character class such as
 * /[\x00-\x1f]/ trips the `no-control-regex` lint rule, and writing the
 * characters literally into source would turn the file into a binary.
 */
function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
}

const noControlCharacters = (value: string) => !hasControlCharacter(value);

// Mirrors the user_tasks_title_valid check constraint: trimmed, 1..200.
export const taskTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(noControlCharacters, { message: 'Task title must not contain control characters.' });

// Mirrors the watchlists_name_valid check constraint: trimmed, 1..80.
export const watchlistNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(noControlCharacters, { message: 'Watchlist name must not contain control characters.' });

// Mirrors the user_projects_notes_valid check constraint.
export const participationNotesSchema = z
  .string()
  .trim()
  .max(4000)
  .nullable()
  .refine((value) => value === null || !hasControlCharacter(value), {
    message: 'Participation notes must not contain control characters.',
  });

/**
 * Fields this product must never accept, in any execution payload: anything
 * that looks like a secret. As in the Identity domain, the guard is a
 * *rejection* rather than a sanitising drop — a client that sends one is an
 * incident, and silently removing the field would hide it.
 */
const forbiddenKeyLikeFields: readonly RegExp[] = [
  /private[_-]?key/i,
  /mnemonic/i,
  /seed[_-]?phrase/i,
  /keystore/i,
  /secret/i,
  /passphrase/i,
  /recovery[_-]?phrase/i,
  /wallet[_-]?password/i,
];

export function findForbiddenExecutionKeys(payload: unknown): readonly string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return [];
  }
  return Object.keys(payload as Record<string, unknown>).filter((key) =>
    forbiddenKeyLikeFields.some((pattern) => pattern.test(key)),
  );
}
