import { createApiSuccessSchema, type ApiSuccess } from '@airdrop/contracts';
import { z } from 'zod';

const healthDataSchema = z
  .object({
    service: z.literal('web'),
    status: z.literal('healthy')
  })
  .strict();

const healthResponseSchema = createApiSuccessSchema(healthDataSchema);

type HealthData = z.infer<typeof healthDataSchema>;

export async function GET(): Promise<Response> {
  const response: ApiSuccess<HealthData> = {
    ok: true,
    data: { service: 'web', status: 'healthy' },
    meta: { requestId: crypto.randomUUID(), nextCursor: null }
  };

  return Response.json(healthResponseSchema.parse(response));
}
