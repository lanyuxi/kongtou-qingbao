import { z } from 'zod';

import {
  profileAvatarUrlSchema,
  profileDisplayNameSchema,
  profileTimezoneSchema,
  walletAddressSchema,
  walletChainSchema,
  walletVisibilitySchema,
} from './enums.js';

// Projections are what leaves the database. Everything is strict, and the
// public projection is a separate schema rather than a filtered copy of the
// private one, so a future field can be added to the private row without
// silently becoming public.

export const walletAddressRowSchema = z.strictObject({
  walletAddressId: z.uuid(),
  chain: walletChainSchema,
  address: walletAddressSchema,
  label: z.string().nullable(),
  visibility: walletVisibilitySchema,
  version: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const userProfileRowSchema = z.strictObject({
  userId: z.uuid(),
  displayName: profileDisplayNameSchema.nullable(),
  avatarUrl: profileAvatarUrlSchema.nullable(),
  timezone: profileTimezoneSchema.nullable(),
  version: z.number().int().min(1),
  updatedAt: z.string(),
});

/**
 * What an anonymous visitor may see. Decision D4: only addresses the user
 * explicitly published, and nothing else about the account — no email, no
 * wallet count, no timestamps that could be used to profile activity.
 */
export const publicIdentityProfileSchema = z.strictObject({
  userId: z.uuid(),
  displayName: profileDisplayNameSchema.nullable(),
  avatarUrl: profileAvatarUrlSchema.nullable(),
});

export const publicWalletAddressSchema = z.strictObject({
  walletAddressId: z.uuid(),
  chain: walletChainSchema,
  address: walletAddressSchema,
  label: z.string().nullable(),
});

export type WalletAddressRow = z.infer<typeof walletAddressRowSchema>;
export type UserProfileRow = z.infer<typeof userProfileRowSchema>;
export type PublicIdentityProfile = z.infer<typeof publicIdentityProfileSchema>;
export type PublicWalletAddress = z.infer<typeof publicWalletAddressSchema>;
