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
