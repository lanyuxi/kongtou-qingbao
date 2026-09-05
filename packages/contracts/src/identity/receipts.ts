import { z } from 'zod';

const receiptEnvelope = {
  version: z.literal(1),
  commandId: z.uuid(),
  replayed: z.boolean(),
};

export const updateProfileReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  profileId: z.uuid(),
  profileVersion: z.number().int().positive(),
});

export const addWalletAddressReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  walletAddressId: z.uuid(),
  walletAddressVersion: z.number().int().positive(),
  profileVersion: z.number().int().positive(),
});

export const setWalletAddressVisibilityReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  walletAddressId: z.uuid(),
  walletAddressVersion: z.number().int().positive(),
});

export const removeWalletAddressReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  walletAddressId: z.uuid(),
  walletAddressVersion: z.number().int().positive(),
});

export type UpdateProfileReceipt = z.infer<typeof updateProfileReceiptSchema>;
export type AddWalletAddressReceipt = z.infer<typeof addWalletAddressReceiptSchema>;
export type SetWalletAddressVisibilityReceipt = z.infer<
  typeof setWalletAddressVisibilityReceiptSchema
>;
export type RemoveWalletAddressReceipt = z.infer<typeof removeWalletAddressReceiptSchema>;
