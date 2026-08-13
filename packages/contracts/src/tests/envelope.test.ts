import { describe, expect, it } from 'vitest';

import {
  apiErrorSchema,
  createApiSuccessSchema,
  createJobEnvelopeSchema
} from '../index.js';
import { z } from 'zod';

const requestId = '6af574a7-5e7b-4926-b9a8-b84404d2f3b0';
const jobId = '1d3f7bea-cc64-4d04-8275-88d9dbe54a47';
const occurredAt = '2026-08-09T12:34:56.000Z';

describe('API envelopes', () => {
  it('rejects an unknown key on a success envelope', () => {
    const schema = createApiSuccessSchema(z.object({ service: z.literal('web') }).strict());

    expect(
      schema.safeParse({
        ok: true,
        data: { service: 'web' },
        meta: { requestId, nextCursor: null },
        unexpected: true
      }).success
    ).toBe(false);
  });

  it('rejects an invalid UUID in an error envelope', () => {
    expect(
      apiErrorSchema.safeParse({
        ok: false,
        error: { code: 'INVALID', message: 'Invalid request', requestId: 'not-a-uuid', details: null }
      }).success
    ).toBe(false);
  });
});

describe('job envelopes', () => {
  const schema = createJobEnvelopeSchema('collect.project', z.object({ projectId: z.string() }).strict());

  it('rejects unknown keys, invalid bounded idempotency keys, invalid timestamps, and non-one versions', () => {
    const base = {
      jobId,
      type: 'collect.project',
      version: 1,
      idempotencyKey: 'collect:project:1',
      correlationId: requestId,
      occurredAt,
      payload: { projectId: 'project-1' }
    };

    expect(schema.safeParse({ ...base, unexpected: true }).success).toBe(false);
    expect(schema.safeParse({ ...base, idempotencyKey: '   ' }).success).toBe(false);
    expect(schema.safeParse({ ...base, idempotencyKey: 'a'.repeat(256) }).success).toBe(false);
    expect(schema.safeParse({ ...base, occurredAt: 'not-a-timestamp' }).success).toBe(false);
    expect(schema.safeParse({ ...base, version: 2 }).success).toBe(false);
  });

  it('preserves surrounding idempotency-key whitespace while bounding the raw value', () => {
    const surroundedKey = ' collect:project:1 ';
    const base = {
      jobId,
      type: 'collect.project',
      version: 1,
      idempotencyKey: 'collect:project:1',
      correlationId: requestId,
      occurredAt,
      payload: { projectId: 'project-1' }
    };

    expect(schema.parse({ ...base, idempotencyKey: surroundedKey }).idempotencyKey).toBe(
      surroundedKey,
    );
    expect(schema.safeParse({ ...base, idempotencyKey: ` ${'a'.repeat(255)}` }).success).toBe(
      false,
    );
  });
});
