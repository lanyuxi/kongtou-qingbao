import { z } from 'zod';

export type JobEnvelope<TType extends string, TPayload> = {
  jobId: string;
  type: TType;
  version: 1;
  idempotencyKey: string;
  correlationId: string;
  occurredAt: string;
  payload: TPayload;
};

export const createJobEnvelopeSchema = <TType extends string, TPayload extends z.ZodType>(
  type: TType,
  payloadSchema: TPayload
) =>
  z
    .object({
      jobId: z.string().uuid(),
      type: z.literal(type),
      version: z.literal(1),
      idempotencyKey: z.string().trim().min(1),
      correlationId: z.string().uuid(),
      occurredAt: z.string().datetime({ offset: true }),
      payload: payloadSchema
    })
    .strict();
