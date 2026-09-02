import type { PublicTutorialDetail, PublicTutorialListItem } from '@airdrop/contracts';
import type { TutorialPublicRepository } from '@airdrop/database';
import { describe, expect, it } from 'vitest';

import {
  createPublicTutorialDetailHandler,
  createPublicTutorialsHandler,
} from '../lib/tutorial-public-handlers.js';

const projectId = 'b2000000-0000-4000-8000-000000000001';
const tutorialId = 'b2000000-0000-4000-8000-000000000002';
const referenceId = 'b2000000-0000-4000-8000-000000000003';
const requestId = 'b2000000-0000-4000-8000-000000000009';

const listItem: PublicTutorialListItem = {
  tutorialId,
  projectId,
  kind: 'airdrop_campaign',
  title: '官方空投参与教程',
  summary: '覆盖从钱包连接到任务领取的完整步骤。',
  version: 1,
  lastVerifiedAt: '2026-09-02T04:30:00.000Z',
  publishedAt: '2026-09-02T04:00:00.000Z',
  stepCount: 2,
};
const detail: PublicTutorialDetail = {
  tutorialId,
  projectId,
  kind: 'airdrop_campaign',
  title: '官方空投参与教程',
  summary: '覆盖从钱包连接到任务领取的完整步骤。',
  version: 1,
  lastVerifiedAt: '2026-09-02T04:30:00.000Z',
  publishedAt: '2026-09-02T04:00:00.000Z',
  steps: [
    { ordinal: 1, title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
    {
      ordinal: 2,
      title: '打开领取页',
      body: '前往官方领取页查看任务。',
      links: [{
        referenceId,
        url: 'https://example.com/claim',
        label: '官方领取页',
        lastVerifiedAt: '2026-09-02T04:00:00.000Z',
        renderable: true,
      }],
    },
  ],
};

function publicStub(overrides: Partial<Record<keyof TutorialPublicRepository, unknown>> = {}) {
  const calls: unknown[] = [];
  const base = {
    listProjectTutorials: async () => ({
      version: 1 as const,
      items: [listItem],
      nextCursor: null,
    }),
    getTutorial: async () => detail,
  };
  const proxy = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    proxy[key] = value;
  }
  for (const key of Object.keys(proxy)) {
    const original = proxy[key];
    if (typeof original === 'function') {
      proxy[key] = async (...args: unknown[]) => {
        calls.push(args);
        return (original as (...a: unknown[]) => unknown)(...args);
      };
    }
  }
  return { repository: proxy as unknown as TutorialPublicRepository, calls };
}

function deps(repository: TutorialPublicRepository) {
  return { publicTutorials: repository, ids: { generate: () => requestId } };
}

describe('tutorial public handlers', () => {
  it('serves the anonymous list without authentication and with project scope', async () => {
    const { repository, calls } = publicStub();
    const handler = createPublicTutorialsHandler(deps(repository));
    const response = await handler(
      new Request(`https://web.test/api/v1/tutorials?projectId=${projectId}`),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      data: { items: [listItem], nextCursor: null },
      meta: { requestId, nextCursor: null },
    });
    expect(calls).toEqual([[{ projectId, cursor: null, limit: 12 }]]);
  });

  it('rejects a public list without a project scope', async () => {
    const { repository, calls } = publicStub();
    const handler = createPublicTutorialsHandler(deps(repository));
    const response = await handler(new Request('https://web.test/api/v1/tutorials'));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_request');
    expect(calls).toEqual([]);
  });

  it('encodes the public next cursor into the envelope meta', async () => {
    const nextCursor = { publishedAt: '2026-09-02T04:00:00.000Z', tutorialId };
    const { repository } = publicStub({
      listProjectTutorials: async () => ({
        version: 1 as const,
        items: [listItem],
        nextCursor,
      }),
    });
    const handler = createPublicTutorialsHandler(deps(repository));
    const response = await handler(
      new Request(`https://web.test/api/v1/tutorials?projectId=${projectId}&limit=1`),
    );
    const body = await response.json();
    expect(typeof body.meta.nextCursor).toBe('string');
    expect(body.data.nextCursor).toBe(body.meta.nextCursor);
    const decoded = JSON.parse(Buffer.from(body.meta.nextCursor, 'base64url').toString('utf8'));
    expect(decoded).toEqual(nextCursor);
  });

  it('serves the anonymous detail envelope', async () => {
    const { repository, calls } = publicStub();
    const handler = createPublicTutorialDetailHandler(deps(repository));
    const response = await handler(
      new Request(`https://web.test/api/v1/tutorials/${tutorialId}`),
      { params: Promise.resolve({ id: tutorialId }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual(detail);
    expect(calls).toEqual([[{ tutorialId }]]);
  });

  it('maps a missing public tutorial onto 404 without leaking internals', async () => {
    const { repository } = publicStub({
      getTutorial: async () => {
        throw Object.assign(new Error('x'), { code: 'tutorial_not_found' });
      },
    });
    const handler = createPublicTutorialDetailHandler(deps(repository));
    const response = await handler(
      new Request(`https://web.test/api/v1/tutorials/${tutorialId}`),
      { params: Promise.resolve({ id: tutorialId }) },
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('tutorial_not_found');
  });

  it('rejects a non-UUID public detail path parameter', async () => {
    const { repository, calls } = publicStub();
    const handler = createPublicTutorialDetailHandler(deps(repository));
    const response = await handler(
      new Request('https://web.test/api/v1/tutorials/not-a-uuid'),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    );
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
