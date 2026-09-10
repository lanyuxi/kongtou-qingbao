import { z } from 'zod';

// Phase 9 Identity enums.
//
// Only EVM addresses are in scope for the first version (decision D3). The
// chain enum exists so a later multi-chain extension is an additive change to
// a closed union rather than a schema rewrite.
export const walletChainSchema = z.enum(['evm']);

// Decision D4: an address record starts hidden and the user opts it into
// public display. "Public wallet address" describes the address itself — it is
// safe to publish — but the record is owned privately by the user, so nothing
// is visible until they say so.
export const walletVisibilitySchema = z.enum(['hidden', 'public']);

export type WalletChain = z.infer<typeof walletChainSchema>;
export type WalletVisibility = z.infer<typeof walletVisibilitySchema>;

export const identityErrorCodeSchema = z.enum([
  'identity_session_required',
  'identity_profile_not_found',
  'identity_address_invalid',
  'identity_address_duplicate',
  'identity_address_limit_reached',
  'identity_version_conflict',
  'identity_idempotency_conflict',
  'identity_command_invalid',
  'identity_query_failed',
  'identity_persistence_failed',
]);

export type IdentityErrorCode = z.infer<typeof identityErrorCodeSchema>;

export const profileDisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80);

export const profileAvatarUrlSchema = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((value) => value.startsWith('https://'), {
    message: 'Avatar URL must use https.'
  });

export const profileTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64);

// ---------------------------------------------------------------------------
// Phase 11: phone + password credentials
// ---------------------------------------------------------------------------

/**
 * Mainland China mobile number, which is the login identifier users type.
 * Stored digits-only: no spaces, dashes, or country code, so the value that
 * reaches the database is identical to the value the login form collected and
 * the unique index can do its job.
 */
const mainlandPhonePattern = /^1[3-9][0-9]{9}$/;

export const loginPhoneSchema = z
  .string()
  .trim()
  .regex(mainlandPhonePattern, 'Mobile number must be 11 digits starting with 1.');

/**
 * Password policy for phone accounts.
 *
 * The upper bound is 72 because that is where bcrypt — which Supabase Auth
 * hashes with — stops reading input; accepting longer strings would silently
 * make two different passwords equivalent. The composition rule exists because
 * the account's only second factor is the password itself: there is no SMS
 * step and no magic link to fall back on.
 */
export const accountPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be at most 72 characters.')
  .refine((value) => /[A-Za-z]/.test(value), {
    message: 'Password must contain at least one letter.',
  })
  .refine((value) => /[0-9]/.test(value), {
    message: 'Password must contain at least one digit.',
  })
  .refine((value) => !hasControlCharacter(value), {
    message: 'Password must not contain control characters.',
  });

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });
}


const evmAddressPattern = /^0x[0-9a-fA-F]{40}$/;

export const walletAddressSchema = z
  .string()
  .trim()
  .regex(evmAddressPattern, 'Wallet address must be an EVM address: 0x followed by 40 hex characters.');

export const walletLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(40);

/**
 * Fields this product must never accept, in any identity payload: anything
 * that looks like a secret. The platform rule is absolute — never store,
 * request, log, or transmit a private key, mnemonic, or keystore — so the
 * guard is a *rejection*, not a sanitising drop: a payload carrying one is a
 * hostile or broken client, and silently removing the field would hide that.
 */
const forbiddenKeyLikeFields: readonly RegExp[] = [
  /private[_-]?key/i,
  /mnemonic/i,
  /seed[_-]?phrase/i,
  /keystore/i,
  /secret/i,
  /passphrase/i,
  /recovery[_-]?phrase/i,
];

export function findForbiddenIdentityKeys(payload: unknown): readonly string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return [];
  }
  return Object.keys(payload as Record<string, unknown>).filter((key) =>
    forbiddenKeyLikeFields.some((pattern) => pattern.test(key)),
  );
}
