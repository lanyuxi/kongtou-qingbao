import {
  addWalletAddressCommandSchema,
  addWalletAddressReceiptSchema,
  apiErrorSchema,
  createApiSuccessSchema,
  identityErrorCodeSchema,
  parseIdentityCommand,
  removeWalletAddressCommandSchema,
  removeWalletAddressReceiptSchema,
  setWalletAddressVisibilityCommandSchema,
  setWalletAddressVisibilityReceiptSchema,
  updateProfileCommandSchema,
  updateProfileReceiptSchema,
  userProfileRowSchema,
  walletAddressRowSchema,
  walletAddressSchema,
  type AddWalletAddressReceipt,
  type IdentityErrorCode,
  type RemoveWalletAddressReceipt,
  type SetWalletAddressVisibilityReceipt,
  type UpdateProfileReceipt,
  type UserProfileRow,
  type WalletAddressRow,
  type WalletVisibility,
} from '@airdrop/contracts';
import { z } from 'zod';

const profileResponseSchema = createApiSuccessSchema(userProfileRowSchema);
const walletListResponseSchema = createApiSuccessSchema(z.array(walletAddressRowSchema));
const updateProfileResponseSchema = createApiSuccessSchema(updateProfileReceiptSchema);
const addWalletResponseSchema = createApiSuccessSchema(addWalletAddressReceiptSchema);
const setVisibilityResponseSchema = createApiSuccessSchema(setWalletAddressVisibilityReceiptSchema);
const removeWalletResponseSchema = createApiSuccessSchema(removeWalletAddressReceiptSchema);
const updateProfileInputSchema = updateProfileCommandSchema.omit({ idempotencyKey: true });
const addWalletInputSchema = addWalletAddressCommandSchema.omit({
  idempotencyKey: true,
  chain: true,
  visibility: true,
});
const setVisibilityInputSchema = setWalletAddressVisibilityCommandSchema.omit({ idempotencyKey: true });
const removeWalletInputSchema = removeWalletAddressCommandSchema.omit({ idempotencyKey: true });

export type IdentityApiFailure = {
  readonly ok: false;
  readonly code: IdentityErrorCode;
};

export type IdentityApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | IdentityApiFailure;

type IdentityRequestOperation =
  | 'profile_query'
  | 'wallet_list_query'
  | 'profile_update'
  | 'wallet_add'
  | 'wallet_visibility'
  | 'wallet_remove';

export interface IdentitySessionPort {
  getAccessToken(): Promise<string | null>;
}

export interface IdentityApiClientDependencies {
  readonly session: IdentitySessionPort;
  readonly fetch: typeof globalThis.fetch;
  readonly ids: { generate(): string };
}

export interface IdentityProfileUpdateInput {
  readonly expectedVersion: number;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly timezone: string | null;
}

export interface IdentityWalletAddInput {
  readonly expectedVersion: number;
  readonly address: string;
  readonly label: string | null;
}

export interface IdentityWalletVisibilityInput {
  readonly walletAddressId: string;
  readonly expectedVersion: number;
  readonly visibility: WalletVisibility;
}

export interface IdentityWalletRemoveInput {
  readonly walletAddressId: string;
  readonly expectedVersion: number;
}

export interface IdentityApiClient {
  getProfile(): Promise<IdentityApiResult<UserProfileRow>>;
  listWalletAddresses(): Promise<IdentityApiResult<readonly WalletAddressRow[]>>;
  updateProfile(input: IdentityProfileUpdateInput): Promise<IdentityApiResult<UpdateProfileReceipt>>;
  addWalletAddress(input: IdentityWalletAddInput): Promise<IdentityApiResult<AddWalletAddressReceipt>>;
  setWalletAddressVisibility(
    input: IdentityWalletVisibilityInput,
  ): Promise<IdentityApiResult<SetWalletAddressVisibilityReceipt>>;
  removeWalletAddress(input: IdentityWalletRemoveInput): Promise<IdentityApiResult<RemoveWalletAddressReceipt>>;
}

export function createIdentityApiClient(deps: IdentityApiClientDependencies): IdentityApiClient {
  return {
    getProfile: () => query(
      deps,
      '/api/v1/identity/profile',
      profileResponseSchema,
      'profile_query',
    ),
    listWalletAddresses: () => query(
      deps,
      '/api/v1/identity/wallet-addresses',
      walletListResponseSchema,
      'wallet_list_query',
    ),
    updateProfile: (input) => mutation(
      deps,
      '/api/v1/identity/profile',
      'PATCH',
      input,
      (rawInput) => parseIdentityCommand(updateProfileInputSchema, rawInput),
      (idempotencyKey) => parseIdentityCommand(updateProfileCommandSchema, {
        ...input,
        idempotencyKey,
      }),
      updateProfileResponseSchema,
      'profile_update',
    ),
    addWalletAddress: (input) => mutation(
      deps,
      '/api/v1/identity/wallet-addresses',
      'POST',
      input,
      (rawInput) => parseIdentityCommand(addWalletInputSchema, rawInput),
      (idempotencyKey) => parseIdentityCommand(addWalletAddressCommandSchema, {
        ...input,
        idempotencyKey,
        chain: 'evm',
        visibility: 'hidden',
      }),
      addWalletResponseSchema,
      'wallet_add',
      walletAddressSchema.safeParse(input.address).success
        ? 'identity_command_invalid'
        : 'identity_address_invalid',
    ),
    setWalletAddressVisibility: (input) => mutation(
      deps,
      `/api/v1/identity/wallet-addresses/${input.walletAddressId}`,
      'PATCH',
      input,
      (rawInput) => parseIdentityCommand(setVisibilityInputSchema, rawInput),
      (idempotencyKey) => parseIdentityCommand(setWalletAddressVisibilityCommandSchema, {
        ...input,
        idempotencyKey,
      }),
      setVisibilityResponseSchema,
      'wallet_visibility',
    ),
    removeWalletAddress: (input) => mutation(
      deps,
      `/api/v1/identity/wallet-addresses/${input.walletAddressId}`,
      'DELETE',
      input,
      (rawInput) => parseIdentityCommand(removeWalletInputSchema, rawInput),
      (idempotencyKey) => parseIdentityCommand(removeWalletAddressCommandSchema, {
        ...input,
        idempotencyKey,
      }),
      removeWalletResponseSchema,
      'wallet_remove',
    ),
  };
}

async function query<T>(
  deps: IdentityApiClientDependencies,
  input: string,
  schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>,
  operation: IdentityRequestOperation,
): Promise<IdentityApiResult<T>> {
  return request(deps, input, { method: 'GET' }, schema, 'identity_query_failed', operation);
}

async function mutation<TCommand, T>(
  deps: IdentityApiClientDependencies,
  input: string,
  method: 'PATCH' | 'POST' | 'DELETE',
  _untrustedInput: TCommand,
  parseRawInput: (input: TCommand) => unknown,
  parseCommand: (idempotencyKey: string) => unknown,
  schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>,
  operation: IdentityRequestOperation,
  invalidCode: IdentityErrorCode = 'identity_command_invalid',
): Promise<IdentityApiResult<T>> {
  let idempotencyKey: string;
  let command: unknown;
  try {
    parseRawInput(_untrustedInput);
    idempotencyKey = deps.ids.generate();
    command = parseCommand(idempotencyKey);
  } catch {
    return failure(invalidCode);
  }

  return request(deps, input, {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(command),
  }, schema, 'identity_persistence_failed', operation);
}

async function request<T>(
  deps: IdentityApiClientDependencies,
  input: string,
  init: RequestInit,
  schema: z.ZodType<{ ok: true; data: T; meta: { requestId: string; nextCursor: string | null } }>,
  fallbackCode: 'identity_query_failed' | 'identity_persistence_failed',
  operation: IdentityRequestOperation,
): Promise<IdentityApiResult<T>> {
  let accessToken: string | null;
  try {
    accessToken = await deps.session.getAccessToken();
  } catch {
    return failure('identity_session_required');
  }
  if (accessToken === null || !/^\S+$/u.test(accessToken)) {
    return failure('identity_session_required');
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
    const parsedCode = identityErrorCodeSchema.safeParse(parsedError.data.error.code);
    return parsedCode.success && isExpectedError(operation, response.status, parsedCode.data)
      ? failure(parsedCode.data)
      : failure(fallbackCode);
  } catch {
    return failure(fallbackCode);
  }
}

function isExpectedError(
  operation: IdentityRequestOperation,
  status: number,
  code: IdentityErrorCode,
): boolean {
  if (status === 401) return code === 'identity_session_required';
  if (operation === 'profile_query') return status === 404 && code === 'identity_profile_not_found';
  if (operation === 'wallet_list_query') return false;
  if (operation === 'profile_update') {
    return (status === 404 && code === 'identity_profile_not_found')
      || (status === 409 && (code === 'identity_version_conflict' || code === 'identity_idempotency_conflict'));
  }
  if (operation === 'wallet_add') {
    return (status === 404 && code === 'identity_profile_not_found')
      || (status === 409 && (
        code === 'identity_address_duplicate'
        || code === 'identity_address_limit_reached'
        || code === 'identity_version_conflict'
        || code === 'identity_idempotency_conflict'
      ));
  }
  if (operation === 'wallet_visibility' || operation === 'wallet_remove') {
    return (status === 404 && code === 'identity_command_invalid')
      || (status === 409 && (code === 'identity_version_conflict' || code === 'identity_idempotency_conflict'));
  }
  return false;
}

function failure(code: IdentityErrorCode): IdentityApiFailure {
  return { ok: false, code };
}
