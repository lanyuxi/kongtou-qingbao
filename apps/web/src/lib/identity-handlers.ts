import {
  addWalletAddressCommandSchema,
  addWalletAddressReceiptSchema,
  apiErrorSchema,
  createApiSuccessSchema,
  parseIdentityCommand,
  publicIdentityProfileSchema,
  publicWalletAddressSchema,
  removeWalletAddressCommandSchema,
  removeWalletAddressReceiptSchema,
  setWalletAddressVisibilityCommandSchema,
  setWalletAddressVisibilityReceiptSchema,
  updateProfileCommandSchema,
  updateProfileReceiptSchema,
  userProfileRowSchema,
  walletAddressRowSchema,
  type AddWalletAddressCommand,
  type RemoveWalletAddressCommand,
  type SetWalletAddressVisibilityCommand,
  type UpdateProfileCommand,
} from '@airdrop/contracts';
import type {
  IdentityProfileRepository,
  IdentityWalletAddressRepository,
} from '@airdrop/database';
import { z } from 'zod';

import type { AuthenticatedUserVerifier } from './authenticated-user.js';

export type IdentityHandlerDependencies = {
  readonly auth: AuthenticatedUserVerifier;
  readonly profiles: IdentityProfileRepository;
  readonly wallets: IdentityWalletAddressRepository;
  readonly ids: { generate(): string };
};
type IdentityProfileHandlerDependencies = Pick<IdentityHandlerDependencies, 'auth' | 'profiles' | 'ids'>;
type IdentityWalletHandlerDependencies = Pick<IdentityHandlerDependencies, 'auth' | 'wallets' | 'ids'>;
type IdentityPublicProfileHandlerDependencies = Pick<IdentityHandlerDependencies, 'profiles' | 'wallets' | 'ids'>;

type IdContext = { params: Promise<Record<string, string>> };
type Authentication =
  | { readonly kind: 'verified'; readonly accessToken: string }
  | { readonly kind: 'no_session' }
  | { readonly kind: 'failed' };
type IdentityCommand =
  | UpdateProfileCommand
  | AddWalletAddressCommand
  | SetWalletAddressVisibilityCommand
  | RemoveWalletAddressCommand;

const uuidSchema = z.uuid();
const profileResponseSchema = createApiSuccessSchema(userProfileRowSchema);
const walletListResponseSchema = createApiSuccessSchema(z.array(walletAddressRowSchema));
const updateProfileResponseSchema = createApiSuccessSchema(updateProfileReceiptSchema);
const addWalletResponseSchema = createApiSuccessSchema(addWalletAddressReceiptSchema);
const setVisibilityResponseSchema = createApiSuccessSchema(setWalletAddressVisibilityReceiptSchema);
const removeWalletResponseSchema = createApiSuccessSchema(removeWalletAddressReceiptSchema);
const publicProfileResponseSchema = createApiSuccessSchema(z.strictObject({
  profile: publicIdentityProfileSchema,
  walletAddresses: z.array(publicWalletAddressSchema),
}));

export function createIdentityProfileHandler(deps: IdentityProfileHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const authentication = await authenticate(request, deps.auth);
    if (authentication.kind !== 'verified') {
      return privateAuthenticationFailure(authentication, request.method, requestId);
    }
    const token = authentication.accessToken;
    if (hasQueryParameters(request)) return errorResponse(400, 'invalid_request', requestId);

    if (request.method === 'GET') {
      try {
        return successResponse(profileResponseSchema, await deps.profiles.getMine({ accessToken: token }), requestId);
      } catch (error) {
        return repositoryError(error, requestId, 'query');
      }
    }

    if (request.method === 'PATCH') {
      const command = await parseCommand(request, updateProfileCommandSchema);
      if (command === null || !hasMatchingIdempotencyKey(request, command)) {
        return errorResponse(400, 'invalid_request', requestId);
      }
      try {
        return successResponse(
          updateProfileResponseSchema,
          await deps.profiles.update({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    return errorResponse(400, 'invalid_request', requestId);
  };
}

export function createIdentityWalletAddressHandler(deps: IdentityWalletHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const requestId = deps.ids.generate();
    const authentication = await authenticate(request, deps.auth);
    if (authentication.kind !== 'verified') {
      return privateAuthenticationFailure(authentication, request.method, requestId);
    }
    const token = authentication.accessToken;
    if (hasQueryParameters(request)) return errorResponse(400, 'invalid_request', requestId);

    if (request.method === 'GET') {
      try {
        return successResponse(walletListResponseSchema, await deps.wallets.listMine({ accessToken: token }), requestId);
      } catch (error) {
        return repositoryError(error, requestId, 'query');
      }
    }

    if (request.method === 'POST') {
      const command = await parseCommand(request, addWalletAddressCommandSchema);
      if (command === null || !hasMatchingIdempotencyKey(request, command)) {
        return errorResponse(400, 'invalid_request', requestId);
      }
      try {
        return successResponse(
          addWalletResponseSchema,
          await deps.wallets.add({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation');
      }
    }

    return errorResponse(400, 'invalid_request', requestId);
  };
}

export function createIdentityWalletAddressItemHandler(deps: IdentityWalletHandlerDependencies) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate();
    const authentication = await authenticate(request, deps.auth);
    if (authentication.kind !== 'verified') {
      return privateAuthenticationFailure(authentication, request.method, requestId);
    }
    const token = authentication.accessToken;
    if (hasQueryParameters(request)) return errorResponse(400, 'invalid_request', requestId);
    const id = uuidSchema.safeParse((await context.params).id);
    if (!id.success) return errorResponse(400, 'invalid_request', requestId);

    if (request.method === 'PATCH') {
      const command = await parseCommand(request, setWalletAddressVisibilityCommandSchema);
      if (
        command === null
        || !hasMatchingIdempotencyKey(request, command)
        || command.walletAddressId !== id.data
      ) return errorResponse(400, 'invalid_request', requestId);
      try {
        return successResponse(
          setVisibilityResponseSchema,
          await deps.wallets.setVisibility({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation', true);
      }
    }

    if (request.method === 'DELETE') {
      const command = await parseCommand(request, removeWalletAddressCommandSchema);
      if (
        command === null
        || !hasMatchingIdempotencyKey(request, command)
        || command.walletAddressId !== id.data
      ) return errorResponse(400, 'invalid_request', requestId);
      try {
        return successResponse(
          removeWalletResponseSchema,
          await deps.wallets.remove({ accessToken: token, command }),
          requestId,
        );
      } catch (error) {
        return repositoryError(error, requestId, 'mutation', true);
      }
    }

    return errorResponse(400, 'invalid_request', requestId);
  };
}

export function createIdentityPublicProfileHandler(deps: IdentityPublicProfileHandlerDependencies) {
  return async (request: Request, context: IdContext): Promise<Response> => {
    const requestId = deps.ids.generate();
    if (hasQueryParameters(request)) return errorResponse(400, 'invalid_request', requestId);
    const userId = uuidSchema.safeParse((await context.params).userId);
    if (!userId.success) return errorResponse(400, 'invalid_request', requestId);
    try {
      const [profile, walletAddresses] = await Promise.all([
        deps.profiles.getPublic({ userId: userId.data }),
        deps.wallets.listPublic({ userId: userId.data }),
      ]);
      return successResponse(publicProfileResponseSchema, { profile, walletAddresses }, requestId);
    } catch (error) {
      return repositoryError(error, requestId, 'query');
    }
  };
}

async function authenticate(request: Request, auth: AuthenticatedUserVerifier): Promise<Authentication> {
  const authorization = request.headers.get('authorization');
  try {
    const user = await auth.verifyAuthorizationHeader(authorization);
    const accessToken = bearerToken(authorization);
    return user === null || accessToken === null
      ? { kind: 'no_session' }
      : { kind: 'verified', accessToken };
  } catch {
    return { kind: 'failed' };
  }
}

function privateAuthenticationFailure(
  authentication: Exclude<Authentication, { readonly kind: 'verified' }>,
  method: string,
  requestId: string,
): Response {
  if (authentication.kind === 'no_session') {
    return errorResponse(401, 'identity_session_required', requestId);
  }
  return errorResponse(
    500,
    method === 'PATCH' || method === 'POST' || method === 'DELETE'
      ? 'identity_persistence_failed'
      : 'identity_query_failed',
    requestId,
  );
}

function bearerToken(value: string | null): string | null {
  if (value === null) return null;
  return /^Bearer ([^\s]+)$/.exec(value)?.[1] ?? null;
}

function hasQueryParameters(request: Request): boolean {
  return new URL(request.url).search.length > 0;
}

async function parseCommand<T extends IdentityCommand>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    return parseIdentityCommand(schema, await request.json());
  } catch {
    return null;
  }
}

function hasMatchingIdempotencyKey(request: Request, command: IdentityCommand): boolean {
  const header = request.headers.get('idempotency-key');
  return validIdempotencyKey(header) && header === command.idempotencyKey;
}

function validIdempotencyKey(value: string | null): value is string {
  return value !== null
    && value === value.trim()
    && Array.from(value).length >= 1
    && Array.from(value).length <= 255
    && isPostgresText(value);
}

function isPostgresText(value: string): boolean {
  if (value.includes('\u0000')) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function successResponse<T extends z.ZodType>(schema: T, data: unknown, requestId: string): Response {
  return Response.json(schema.parse({
    ok: true,
    data,
    meta: { requestId, nextCursor: null },
  }));
}

function repositoryError(
  error: unknown,
  requestId: string,
  kind: 'query' | 'mutation',
  pathWalletMutation = false,
): Response {
  const code = errorCode(error);
  if (code === 'identity_session_required') return errorResponse(401, code, requestId);
  if (code === 'identity_profile_not_found') return errorResponse(404, code, requestId);
  if (pathWalletMutation && code === 'identity_command_invalid') {
    return errorResponse(404, code, requestId);
  }
  if (code === 'identity_address_invalid' || code === 'identity_command_invalid') {
    return errorResponse(400, code, requestId);
  }
  if (
    code === 'identity_version_conflict'
    || code === 'identity_idempotency_conflict'
    || code === 'identity_address_duplicate'
    || code === 'identity_address_limit_reached'
  ) return errorResponse(409, code, requestId);
  return errorResponse(500, kind === 'query' ? 'identity_query_failed' : 'identity_persistence_failed', requestId);
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function errorResponse(status: number, code: string, requestId: string): Response {
  return Response.json(apiErrorSchema.parse({
    ok: false,
    error: { code, message: messageFor(code), requestId, details: null },
  }), { status });
}

function messageFor(code: string): string {
  switch (code) {
    case 'identity_session_required': return 'An active identity session is required.';
    case 'identity_profile_not_found': return 'The identity profile was not found.';
    case 'identity_address_invalid': return 'The wallet address is invalid.';
    case 'identity_address_duplicate': return 'The wallet address already exists.';
    case 'identity_address_limit_reached': return 'The wallet address limit has been reached.';
    case 'identity_version_conflict': return 'The identity record has changed.';
    case 'identity_idempotency_conflict': return 'The idempotency key conflicts with a prior identity command.';
    case 'identity_command_invalid': return 'The identity command is invalid.';
    case 'identity_query_failed': return 'Identity records could not be loaded.';
    case 'identity_persistence_failed': return 'The identity command could not be persisted.';
    default: return 'The request is invalid.';
  }
}
