import { type ExecutionErrorCode } from '@airdrop/contracts';
import { createClient } from '@supabase/supabase-js';

const sqlStateErrorCodes = {
  EX201: 'execution_session_required',
  EX202: 'execution_task_not_found',
  EX203: 'execution_watchlist_not_found',
  EX204: 'execution_project_not_found',
  EX205: 'execution_task_limit_reached',
  EX206: 'execution_watchlist_limit_reached',
  EX207: 'execution_watchlist_project_limit_reached',
  EX208: 'execution_name_conflict',
  EX209: 'execution_version_conflict',
  EX210: 'execution_idempotency_conflict',
  EX211: 'execution_command_invalid',
  EX299: 'execution_persistence_failed',
} as const satisfies Record<string, ExecutionErrorCode>;

export type ExecutionRpcCall = {
  readonly accessToken: string | null;
  readonly functionName:
    | 'list_my_execution_tasks'
    | 'list_my_watchlists'
    | 'list_my_watchlist_projects'
    | 'get_my_participation'
    | 'submit_create_task'
    | 'submit_update_task'
    | 'submit_delete_task'
    | 'submit_create_watchlist'
    | 'submit_rename_watchlist'
    | 'submit_delete_watchlist'
    | 'submit_add_watchlist_project'
    | 'submit_remove_watchlist_project'
    | 'submit_set_participation_status';
  readonly args: Readonly<Record<string, unknown>>;
};
export interface ExecutionRpc {
  invoke(call: ExecutionRpcCall): Promise<unknown>;
}
export interface ExecutionRepositoryOptions {
  readonly url: string;
  readonly anonKey: string;
}
export class ExecutionRepositoryError extends Error {
  readonly code: ExecutionErrorCode;
  constructor(code: ExecutionErrorCode) {
    super(code);
    this.name = 'ExecutionRepositoryError';
    this.code = code;
  }
}

// Every request builds its own client scoped to the caller's bearer, so no
// repository instance can ever reuse one session's authority for another's read.
export function createBrowserExecutionRpc(options: ExecutionRepositoryOptions): ExecutionRpc {
  return {
    async invoke(call) {
      const client = createClient(options.url, options.anonKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
        ...(call.accessToken === null
          ? {}
          : { global: { headers: { Authorization: `Bearer ${call.accessToken}` } } }),
      }) as unknown as RawRpcClient;
      const response = await client.rpc(call.functionName, call.args);
      if (response.error !== null) throw response.error;
      return response.data;
    },
  };
}
type RawRpcClient = {
  rpc(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: unknown | null }>;
};

export function requireAccessToken(value: string): string {
  if (value.trim().length === 0) throw new ExecutionRepositoryError('execution_session_required');
  return value;
}
export function arrayResult(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError('execution_rpc_array_expected');
  return value;
}
export function exactSingleRow(value: unknown, code: ExecutionErrorCode): unknown {
  const rows = arrayResult(value);
  if (rows.length === 0) throw new ExecutionRepositoryError(code);
  if (rows.length !== 1) throw new TypeError('execution_exact_row_expected');
  return rows[0];
}
export async function read<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapError(error, 'execution_query_failed');
  }
}
export async function mutate<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapError(error, 'execution_persistence_failed');
  }
}
function mapError(
  error: unknown,
  fallback: 'execution_query_failed' | 'execution_persistence_failed',
) {
  if (error instanceof ExecutionRepositoryError) return error;
  const state = sqlStateOf(error);
  if (state !== null && state in sqlStateErrorCodes)
    return new ExecutionRepositoryError(sqlStateErrorCodes[state as keyof typeof sqlStateErrorCodes]);
  return new ExecutionRepositoryError(fallback);
}
function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}
