import { describe, expect, it } from 'vitest';

import {
  createTutorialPublicRepository,
  TutorialPublicProjectionQueryError,
} from '../repositories/tutorial-public-repository.js';
import type { Database } from '../generated/database.types.js';

const projectId = '62000000-0000-4000-8000-000000000001';
const tutorialId = '62000000-0000-4000-8000-000000000002';
const secondTutorialId = '62000000-0000-4000-8000-000000000003';
const referenceId = '62000000-0000-4000-8000-000000000004';

type QueryBuilderState = {
  readonly table: string;
  readonly select: string;
  filters: string[];
  orders: string[];
  range: [number, number] | null;
};

function row(value: Record<string, unknown>): Record<string, unknown> {
  return value;
}

function createClientStub(responses: Record<string, unknown[]>) {
  const queries: QueryBuilderState[] = [];

  const build = (table: string, select: string): QueryBuilderState => {
    const state: QueryBuilderState = {
      table,
      select,
      filters: [],
      orders: [],
      range: null,
    };
    queries.push(state);
    return state;
  };

  const client = {
    from(table: string) {
      const stateRef = { current: null as QueryBuilderState | null };
      const pending = {
        error: null,
        data: responses[table] ?? [],
      };
      const builder: Record<string, unknown> = {
        select: (columns: string) => {
          stateRef.current = build(table, columns);
          return builder;
        },
        eq: (column: string, value: unknown) => {
          stateRef.current?.filters.push(`${column}=eq:${String(value)}`);
          return builder;
        },
        or: (expression: string) => {
          stateRef.current?.filters.push(`or:${expression}`);
          return builder;
        },
        order: (column: string, options: { ascending?: boolean }) => {
          stateRef.current?.orders.push(
            `${column}:${options?.ascending === false ? 'desc' : 'asc'}`,
          );
          return builder;
        },
        range: (from: number, to: number) => {
          const state = stateRef.current;
          if (state !== null) {
            state.range = [from, to];
          }
          return Promise.resolve(pending);
        },
        // Real supabase query builders are thenable: a detail read awaits the
        // builder directly without a terminal range() call.
        then: (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(pending).then(onFulfilled, onRejected),
      };
      return builder;
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient<Database>;

  return { client, queries };
}

function listRow(overrides: Record<string, unknown> = {}) {
  return row({
    tutorial_id: tutorialId,
    project_id: projectId,
    kind: 'airdrop_campaign',
    title: 'pgTAP 空投参与教程',
    summary: '覆盖从钱包连接到任务领取的完整步骤。',
    version: 1,
    last_verified_at: '2026-09-02T04:30:00+00:00',
    published_at: '2026-09-02T04:00:00+00:00',
    step_count: 2,
    ...overrides,
  });
}

function detailRows(overrides: Record<string, unknown> = {}) {
  const base = {
    tutorial_id: tutorialId,
    project_id: projectId,
    kind: 'airdrop_campaign',
    title: 'pgTAP 空投参与教程',
    summary: '覆盖从钱包连接到任务领取的完整步骤。',
    version: 1,
    last_verified_at: '2026-09-02T04:30:00+00:00',
    published_at: '2026-09-02T04:00:00+00:00',
    ...overrides,
  };
  return [
    row({
      ...base,
      ordinal: 1,
      step_title: '连接钱包',
      step_body: '在官方站点连接钱包并切换网络。',
      link_reference_id: null,
      link_url: null,
      link_label: null,
      link_last_verified_at: null,
      link_renderable: null,
    }),
    row({
      ...base,
      ordinal: 2,
      step_title: '打开领取页',
      step_body: '前往官方领取页查看任务。',
      link_reference_id: referenceId,
      link_url: 'https://pgtap-tutorial.example/claim',
      link_label: '官方领取页',
      link_last_verified_at: '2026-09-02T04:00:00+00:00',
      link_renderable: true,
    }),
  ];
}

describe('TutorialPublicRepository', () => {
  it('queries the public list view with project scope, ordering, and a keyset cursor', async () => {
    const { client, queries } = createClientStub({
      public_project_tutorials: [
        listRow(),
        listRow({
          tutorial_id: secondTutorialId,
          published_at: '2026-09-02T03:00:00+00:00',
        }),
      ],
    });

    await expect(createTutorialPublicRepository(client).listProjectTutorials({
      projectId,
      cursor: { publishedAt: '2026-09-02T05:00:00+00:00', tutorialId: secondTutorialId },
      limit: 12,
    })).resolves.toEqual({
      version: 1,
      items: [
        {
          tutorialId,
          projectId,
          kind: 'airdrop_campaign',
          title: 'pgTAP 空投参与教程',
          summary: '覆盖从钱包连接到任务领取的完整步骤。',
          version: 1,
          lastVerifiedAt: '2026-09-02T04:30:00+00:00',
          publishedAt: '2026-09-02T04:00:00+00:00',
          stepCount: 2,
        },
        {
          tutorialId: secondTutorialId,
          projectId,
          kind: 'airdrop_campaign',
          title: 'pgTAP 空投参与教程',
          summary: '覆盖从钱包连接到任务领取的完整步骤。',
          version: 1,
          lastVerifiedAt: '2026-09-02T04:30:00+00:00',
          publishedAt: '2026-09-02T03:00:00+00:00',
          stepCount: 2,
        },
      ],
      nextCursor: null,
    });

    const query = queries[0];
    expect(query?.table).toBe('public_project_tutorials');
    expect(query?.select).toBe(
      'tutorial_id,project_id,kind,title,summary,version,last_verified_at,published_at,step_count',
    );
    expect(query?.filters).toEqual([
      `project_id=eq:${projectId}`,
      'or:published_at.lt.2026-09-02T05:00:00+00:00,and(published_at.eq.2026-09-02T05:00:00+00:00,tutorial_id.lt.62000000-0000-4000-8000-000000000003)',
    ]);
    expect(query?.orders).toEqual(['published_at:desc', 'tutorial_id:desc']);
  });

  it('emits a next cursor only when the page overflows the limit', async () => {
    const overflowing = createClientStub({
      public_project_tutorials: [
        listRow(),
        listRow({
          tutorial_id: secondTutorialId,
          published_at: '2026-09-02T03:00:00+00:00',
        }),
      ],
    });

    await expect(createTutorialPublicRepository(overflowing.client).listProjectTutorials({
      projectId,
      cursor: null,
      limit: 1,
    })).resolves.toMatchObject({
      nextCursor: { publishedAt: '2026-09-02T04:00:00+00:00', tutorialId },
    });

    const exactPage = createClientStub({
      public_project_tutorials: [listRow()],
    });
    await expect(createTutorialPublicRepository(exactPage.client).listProjectTutorials({
      projectId,
      cursor: null,
      limit: 12,
    })).resolves.toMatchObject({ nextCursor: null });
  });

  it('rejects list rows carrying unexpected fields', async () => {
    const { client } = createClientStub({
      public_project_tutorials: [listRow({ url: 'https://evil.example' })],
    });

    await expect(createTutorialPublicRepository(client).listProjectTutorials({
      projectId,
      cursor: null,
      limit: 12,
    })).rejects.toThrow(TypeError);
  });

  it('rejects list rows outside the requested project', async () => {
    const { client } = createClientStub({
      public_project_tutorials: [
        listRow({ project_id: '62000000-0000-4000-8000-000000000099' }),
      ],
    });

    await expect(createTutorialPublicRepository(client).listProjectTutorials({
      projectId,
      cursor: null,
      limit: 12,
    })).rejects.toThrow(TypeError);
  });

  it('folds the exploded detail rows into the nested public contract', async () => {
    const { client, queries } = createClientStub({
      public_tutorial_detail: detailRows(),
    });

    await expect(createTutorialPublicRepository(client).getTutorial({ tutorialId }))
      .resolves.toEqual({
        tutorialId,
        projectId,
        kind: 'airdrop_campaign',
        title: 'pgTAP 空投参与教程',
        summary: '覆盖从钱包连接到任务领取的完整步骤。',
        version: 1,
        lastVerifiedAt: '2026-09-02T04:30:00+00:00',
        publishedAt: '2026-09-02T04:00:00+00:00',
        steps: [
          { ordinal: 1, title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
          {
            ordinal: 2,
            title: '打开领取页',
            body: '前往官方领取页查看任务。',
            links: [{
              referenceId,
              url: 'https://pgtap-tutorial.example/claim',
              label: '官方领取页',
              lastVerifiedAt: '2026-09-02T04:00:00+00:00',
              renderable: true,
            }],
          },
        ],
      });

    const query = queries[0];
    expect(query?.table).toBe('public_tutorial_detail');
    expect(query?.filters).toEqual([`tutorial_id=eq:${tutorialId}`]);
  });

  it('throws not found when the detail view returns no rows', async () => {
    const { client } = createClientStub({ public_tutorial_detail: [] });

    await expect(createTutorialPublicRepository(client).getTutorial({ tutorialId }))
      .rejects.toThrow(new TutorialPublicProjectionQueryError('tutorial_not_found'));
  });

  it('throws a leak error when an unrenderable link still carries a url', async () => {
    const rows = detailRows();
    const flagged = rows.map((single) => ({
      ...single,
      link_renderable: single.link_reference_id === null ? null : false,
      link_url: single.link_reference_id === null
        ? null
        : 'https://pgtap-tutorial.example/claim',
    }));
    const { client } = createClientStub({
      public_tutorial_detail: flagged,
    });

    await expect(createTutorialPublicRepository(client).getTutorial({ tutorialId }))
      .rejects.toThrow(/unrenderable/);
  });

  it('maps database errors onto the projection query error', async () => {
    const failing = {
      from() {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          range: () => Promise.resolve({
            error: { code: '42501', message: 'permission denied' },
            data: null,
          }),
        };
        return builder;
      },
    } as unknown as import('@supabase/supabase-js').SupabaseClient<Database>;

    await expect(createTutorialPublicRepository(failing).listProjectTutorials({
      projectId,
      cursor: null,
      limit: 12,
    })).rejects.toThrow(new TutorialPublicProjectionQueryError('42501'));
  });
});
