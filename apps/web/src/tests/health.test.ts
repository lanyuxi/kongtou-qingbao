import { describe, expect, it } from 'vitest';

import { GET } from '../app/api/v1/health/route.js';

describe('GET /api/v1/health', () => {
  it('returns the shared healthy web envelope', async () => {
    const response = await GET();
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(body).toMatchObject({
      ok: true,
      data: { service: 'web', status: 'healthy' },
      meta: { nextCursor: null }
    });
    expect(body).toMatchObject({
      meta: { requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) }
    });
  });
});
