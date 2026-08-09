import { describe, expect, it } from 'vitest';

import { GET } from '../app/api/v1/health/route.js';

describe('GET /api/v1/health', () => {
  it('returns the shared healthy web envelope', async () => {
    const firstResponse = await GET();
    const secondResponse = await GET();
    const firstBody: unknown = await firstResponse.json();
    const secondBody: unknown = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get('content-type')).toContain('application/json');
    expect(firstBody).toMatchObject({
      ok: true,
      data: { service: 'web', status: 'healthy' },
      meta: { nextCursor: null }
    });
    expect(firstBody).toMatchObject({
      meta: { requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) }
    });
    expect((firstBody as { meta: { requestId: string } }).meta.requestId).not.toBe(
      (secondBody as { meta: { requestId: string } }).meta.requestId
    );
  });
});
