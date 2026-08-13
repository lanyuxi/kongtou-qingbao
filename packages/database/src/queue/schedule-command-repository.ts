import { createHash } from 'node:crypto';

import {
  sourceScheduleCommandResultSchema,
  sourceScheduleCommandSchema,
  type SourceScheduleCommand,
  type SourceScheduleCommandResult,
} from '@airdrop/contracts';
import postgres, { type Sql, type TransactionSql } from 'postgres';

export interface ExecuteScheduleCommandInput {
  readonly actorId: string;
  readonly scheduleId: string;
  readonly idempotencyKey: string;
  readonly command: SourceScheduleCommand;
}

export interface ScheduleCommandRepository {
  execute(input: ExecuteScheduleCommandInput): Promise<SourceScheduleCommandResult>;
}

type ScheduleCommandFunctionName = 'execute_source_schedule_command';

export interface ScheduleCommandFunctionCall {
  readonly functionName: ScheduleCommandFunctionName;
  readonly args: Readonly<Record<string, string>>;
}

export interface ScheduleCommandFunctionTransaction {
  invoke(call: ScheduleCommandFunctionCall): Promise<unknown>;
}

export interface ScheduleCommandFunctionClient {
  transaction<T>(work: (transaction: ScheduleCommandFunctionTransaction) => Promise<T>): Promise<T>;
}

type ScheduleCommandErrorCode =
  | 'schedule_version_conflict'
  | 'idempotency_conflict'
  | 'schedule_not_found'
  | 'admin_required';

export class ScheduleCommandRejectionError extends Error {
  constructor(readonly code: ScheduleCommandErrorCode) {
    super(code);
    this.name = 'ScheduleCommandRejectionError';
  }
}

export class ScheduleCommandPersistenceError extends Error {
  readonly code = 'schedule_command_persistence_failed' as const;

  constructor() {
    super('schedule_command_persistence_failed');
    this.name = 'ScheduleCommandPersistenceError';
  }
}

export function createScheduleCommandRepository(
  databaseUrl: string,
): ScheduleCommandRepository & { close(): Promise<void> } {
  const sql = postgres(databaseUrl, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 5,
  });
  const repository = createScheduleCommandRepositoryFromClient(createPostgresScheduleCommandClient(sql));
  return Object.assign(repository, { close: async () => sql.end() });
}

export function createScheduleCommandRepositoryFromClient(
  client: ScheduleCommandFunctionClient,
): ScheduleCommandRepository {
  return {
    execute: async (input) => {
      try {
        const parsed = parseInput(input);
        const row = await client.transaction(async (transaction) => oneRow(
          await transaction.invoke({
            functionName: 'execute_source_schedule_command',
            args: {
              p_actor_id: parsed.actorId,
              p_schedule_id: parsed.scheduleId,
              p_command_payload: parsed.payload,
              p_idempotency_key: parsed.idempotencyKey,
              p_input_hash: parsed.inputHash,
            },
          }),
        ));
        return sourceScheduleCommandResultSchema.parse({
          scheduleId: row.schedule_id,
          command: row.command,
          scheduleVersion: parsePositivePgBigint(row.schedule_version),
          enabled: row.enabled,
          intervalSeconds: row.interval_seconds,
          nextRunAt: parseTimestamp(row.next_run_at),
          jobId: row.job_id,
          replayed: row.replayed,
        });
      } catch (error) {
        const rejection = scheduleCommandRejection(error);
        if (rejection !== undefined) throw new ScheduleCommandRejectionError(rejection);
        throw new ScheduleCommandPersistenceError();
      }
    },
  };
}

export function createPostgresScheduleCommandClient(sql: Sql): ScheduleCommandFunctionClient {
  return {
    transaction: async <T>(work: (transaction: ScheduleCommandFunctionTransaction) => Promise<T>) => {
      const result = await sql.begin(async (transactionSql) => {
        await transactionSql`set local role collection_schedule_admin`;
        return [await work(createPostgresTransaction(transactionSql))] as const;
      });
      return result[0];
    },
  };
}

function createPostgresTransaction(sql: TransactionSql): ScheduleCommandFunctionTransaction {
  return {
    invoke: async ({ args }) => {
      const actorId = requiredArgument(args, 'p_actor_id');
      const scheduleId = requiredArgument(args, 'p_schedule_id');
      const payload = requiredArgument(args, 'p_command_payload');
      const idempotencyKey = requiredArgument(args, 'p_idempotency_key');
      const inputHash = requiredArgument(args, 'p_input_hash');
      return sql`
      select * from public.execute_source_schedule_command(
        ${actorId}::uuid,
        ${scheduleId}::uuid,
        ${sql.json(JSON.parse(payload))},
        ${idempotencyKey}::text,
        ${inputHash}::text,
        clock_timestamp()
      )
    `;
    },
  };
}

function parseInput(input: ExecuteScheduleCommandInput): {
  actorId: string;
  scheduleId: string;
  idempotencyKey: string;
  payload: string;
  inputHash: string;
} {
  const actorId = parseUuid(input.actorId);
  const scheduleId = parseUuid(input.scheduleId);
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  const command = sourceScheduleCommandSchema.parse(input.command);
  const payload = canonicalPayload(command);
  return {
    actorId,
    scheduleId,
    idempotencyKey,
    payload,
    inputHash: createHash('sha256').update(payload, 'utf8').digest('hex'),
  };
}

function canonicalPayload(command: SourceScheduleCommand): string {
  return `{"command": "${command.command}", "version": ${command.version}, "expectedVersion": ${command.expectedVersion}, "intervalSeconds": ${command.intervalSeconds === null ? 'null' : command.intervalSeconds}}`;
}

function oneRow(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) {
    throw new Error('invalid_result');
  }
  const row = value[0];
  const expected = [
    'command', 'enabled', 'interval_seconds', 'job_id', 'next_run_at', 'replayed', 'schedule_id',
    'schedule_version',
  ];
  const actual = Object.keys(row).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('invalid_result');
  }
  return row;
}

function scheduleCommandRejection(error: unknown): ScheduleCommandErrorCode | undefined {
  switch (sqlState(error)) {
    case 'AQ101': return 'schedule_version_conflict';
    case 'AQ102': return 'idempotency_conflict';
    case 'AQ103': return 'schedule_not_found';
    case 'AQ104': return 'admin_required';
    default: return undefined;
  }
}

function sqlState(error: unknown): string | undefined {
  if (!isRecord(error) || typeof error.code !== 'string') return undefined;
  return error.code;
}

function parseUuid(value: unknown): string {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid_uuid');
  }
  return value;
}

function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 255 || value !== value.trim()) {
    throw new Error('invalid_idempotency_key');
  }
  return value;
}

function parsePositivePgBigint(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('invalid_positive_bigint');
    return value;
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error('invalid_positive_bigint');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('unsafe_bigint');
  return parsed;
}

function parseTimestamp(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('invalid_timestamp');
    return value.toISOString();
  }
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error('invalid_timestamp');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredArgument(args: Readonly<Record<string, string>>, key: string): string {
  const value = args[key];
  if (value === undefined) throw new Error('missing_argument');
  return value;
}
