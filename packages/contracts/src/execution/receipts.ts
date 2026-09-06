import { z } from 'zod';

const receiptEnvelope = {
  version: z.literal(1),
  commandId: z.uuid(),
  replayed: z.boolean(),
};

export const createTaskReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  taskId: z.uuid(),
  taskVersion: z.number().int().positive(),
});

export const updateTaskReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  taskId: z.uuid(),
  taskVersion: z.number().int().positive(),
});

export const deleteTaskReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  taskId: z.uuid(),
  taskVersion: z.number().int().positive(),
});

export const createWatchlistReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  watchlistId: z.uuid(),
  watchlistVersion: z.number().int().positive(),
});

export const renameWatchlistReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  watchlistId: z.uuid(),
  watchlistVersion: z.number().int().positive(),
});

export const deleteWatchlistReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  watchlistId: z.uuid(),
  watchlistVersion: z.number().int().positive(),
});

export const addWatchlistProjectReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  watchlistId: z.uuid(),
  watchlistVersion: z.number().int().positive(),
});

export const removeWatchlistProjectReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  watchlistId: z.uuid(),
  watchlistVersion: z.number().int().positive(),
});

export const setParticipationStatusReceiptSchema = z.strictObject({
  ...receiptEnvelope,
  projectId: z.uuid(),
});

export type CreateTaskReceipt = z.infer<typeof createTaskReceiptSchema>;
export type UpdateTaskReceipt = z.infer<typeof updateTaskReceiptSchema>;
export type DeleteTaskReceipt = z.infer<typeof deleteTaskReceiptSchema>;
export type CreateWatchlistReceipt = z.infer<typeof createWatchlistReceiptSchema>;
export type RenameWatchlistReceipt = z.infer<typeof renameWatchlistReceiptSchema>;
export type DeleteWatchlistReceipt = z.infer<typeof deleteWatchlistReceiptSchema>;
export type AddWatchlistProjectReceipt = z.infer<typeof addWatchlistProjectReceiptSchema>;
export type RemoveWatchlistProjectReceipt = z.infer<typeof removeWatchlistProjectReceiptSchema>;
export type SetParticipationStatusReceipt = z.infer<typeof setParticipationStatusReceiptSchema>;
