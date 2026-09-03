import { z } from 'zod';

import {
  findForbiddenIdentityKeys,
  profileAvatarUrlSchema,
  profileDisplayNameSchema,
  profileTimezoneSchema,
  walletAddressSchema,
  walletChainSchema,
  walletLabelSchema,
  walletVisibilitySchema,
} from './enums.js';

// Every command is strict and carries both an idempotency key and the
// aggregate version it was built against, so a stale form can never silently
// overwrite a newer state.

const identityCommandEnvelope = {
  idempotencyKey: z.string().trim().min(8).max(200),
  expectedVersion: z.number().int().min(1),
};

export const updateProfileCommandSchema = z.strictObject({
  ...identityCommandEnvelope,
  displayName: profileDisplayNameSchema.nullable(),
  avatarUrl: profileAvatarUrlSchema.nullable(),
  timezone: profileTimezoneSchema.nullable(),
});

export const addWalletAddressCommandSchema = z.strictObject({
  ...identityCommandEnvelope,
  chain: walletChainSchema,
  address: walletAddressSchema,
  label: walletLabelSchema.nullable(),
  visibility: walletVisibilitySchema,
});

export const setWalletAddressVisibilityCommandSchema = z.strictObject({
  ...identityCommandEnvelope,
  walletAddressId: z.uuid(),
  visibility: walletVisibilitySchema,
});

export const removeWalletAddressCommandSchema = z.strictObject({
  ...identityCommandEnvelope,
  walletAddressId: z.uuid(),
});

export type UpdateProfileCommand = z.infer<typeof updateProfileCommandSchema>;
export type AddWalletAddressCommand = z.infer<typeof addWalletAddressCommandSchema>;
export type SetWalletAddressVisibilityCommand = z.infer<
  typeof setWalletAddressVisibilityCommandSchema
>;
export type RemoveWalletAddressCommand = z.infer<typeof removeWalletAddressCommandSchema>;

/**
 * Rejects any command that carries a key-like field outright. This is the
 * contract-level half of the platform rule: the database must never see
 * anything resembling a secret, and a client that sends one is an incident,
 * not a formatting problem — so it fails loudly instead of being stripped.
 */
export function parseIdentityCommand<TSchema extends z.ZodType>(
  schema: TSchema,
  payload: unknown,
): z.infer<TSchema> {
  const forbidden = findForbiddenIdentityKeys(payload);
  if (forbidden.length > 0) {
    throw new IdentityForbiddenFieldError(forbidden);
  }
  return schema.parse(payload);
}

export class IdentityForbiddenFieldError extends Error {
  readonly code = 'identity_command_invalid' as const;

  constructor(readonly fields: readonly string[]) {
    super('Identity commands must never carry secret-like fields.');
    this.name = 'IdentityForbiddenFieldError';
  }
}
