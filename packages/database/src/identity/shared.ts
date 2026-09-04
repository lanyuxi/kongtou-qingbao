import { publicIdentityProfileSchema, type IdentityErrorCode } from '@airdrop/contracts';
import { createClient } from '@supabase/supabase-js';

const sqlStateErrorCodes = {
  ID201: 'identity_session_required',
  ID202: 'identity_profile_not_found',
  ID203: 'identity_address_invalid',
  ID204: 'identity_address_duplicate',
  ID205: 'identity_address_limit_reached',
  ID206: 'identity_version_conflict',
  ID207: 'identity_idempotency_conflict',
  ID208: 'identity_command_invalid',
  ID299: 'identity_persistence_failed',
} as const satisfies Record<string, IdentityErrorCode>;

export type IdentityRpcCall = {
  readonly accessToken: string | null;
  readonly functionName:
    | 'get_my_identity_profile'
    | 'get_public_identity_profile'
    | 'list_my_wallet_addresses'
    | 'list_public_identity_wallet_addresses'
    | 'submit_update_profile'
    | 'submit_add_wallet_address'
    | 'submit_set_wallet_address_visibility'
    | 'submit_remove_wallet_address';
  readonly args: Readonly<Record<string, unknown>>;
};
export interface IdentityRpc {
  invoke(call: IdentityRpcCall): Promise<unknown>;
}
export interface IdentityRepositoryOptions {
  readonly url: string;
  readonly anonKey: string;
}
export class IdentityRepositoryError extends Error {
  readonly code: IdentityErrorCode;
  constructor(code: IdentityErrorCode) {
    super(code);
    this.name = 'IdentityRepositoryError';
    this.code = code;
  }
}

export function createBrowserIdentityRpc(options: IdentityRepositoryOptions): IdentityRpc {
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
  if (value.trim().length === 0) throw new IdentityRepositoryError('identity_session_required');
  return value;
}
export function exactProfileRow(value: unknown): unknown {
  const rows = arrayResult(value);
  if (rows.length === 0) throw new IdentityRepositoryError('identity_profile_not_found');
  if (rows.length !== 1) throw new TypeError('identity_exact_profile_row_expected');
  return rows[0];
}
export function arrayResult(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError('identity_rpc_array_expected');
  return value;
}
export function parsePublicUserId(value: unknown): string {
  return publicIdentityProfileSchema.pick({ userId: true }).parse({ userId: value }).userId;
}
export async function read<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapError(error, 'identity_query_failed');
  }
}
export async function mutate<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapError(error, 'identity_persistence_failed');
  }
}
function mapError(
  error: unknown,
  fallback: 'identity_query_failed' | 'identity_persistence_failed',
) {
  if (error instanceof IdentityRepositoryError) return error;
  const state = sqlStateOf(error);
  if (state !== null && state in sqlStateErrorCodes)
    return new IdentityRepositoryError(
      sqlStateErrorCodes[state as keyof typeof sqlStateErrorCodes],
    );
  return new IdentityRepositoryError(fallback);
}
function sqlStateOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}
