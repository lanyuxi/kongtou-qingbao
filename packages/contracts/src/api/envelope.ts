import { z } from 'zod';

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta: { requestId: string; nextCursor: string | null };
};

export type ApiError = {
  ok: false;
  error: { code: string; message: string; requestId: string; details: Record<string, unknown> | null };
};

const metaSchema = z
  .object({
    requestId: z.string().uuid(),
    nextCursor: z.string().min(1).nullable()
  })
  .strict();

export const createApiSuccessSchema = <T extends z.ZodType>(dataSchema: T) =>
  z
    .object({
      ok: z.literal(true),
      data: dataSchema,
      meta: metaSchema
    })
    .strict();

export const apiErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        requestId: z.string().uuid(),
        details: z.record(z.string(), z.unknown()).nullable()
      })
      .strict()
  })
  .strict();
