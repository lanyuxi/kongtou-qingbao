import {
  publicProjectDomainAuthoritySchema,
  publicProjectReferenceSchema,
} from '@airdrop/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import {
  createReferencePublicRepository,
  ReferencePublicProjectionQueryError,
} from '../repositories/reference-public-repository.js';

const projectId = '81000000-0000-4000-8000-000000000001';
const otherProjectId = '81000000-0000-4000-8000-000000000002';
const referenceId = '81000000-0000-4000-8000-000000000011';
const secondReferenceId = '81000000-0000-4000-8000-000000000012';
const authorityId = '81000000-0000-4000-8000-000000000021';
const verifiedAt = '2026-08-30T04:00:00.000Z';
const earlierVerifiedAt = '2026-08-30T03:00:00.000Z';
const grantedAt = '2026-08-30T02:00:00.000Z';

const referenceRow = {
  reference_id: referenceId,
  project_id: projectId,
  kind: 'official_site',
  label: '官方网站',
  url: 'https://example.com/',
  last_verified_at: verifiedAt,
} as const;

const authorityRow = {
  authority_id: authorityId,
  project_id: projectId,
  domain: 'example.com',
  granted_at: grantedAt,
} as const;

describe('ReferencePublicRepository.listVerifiedReferences', () => {
  it('prevents a public reference read from falling back to a base reference table', async () => {
    const client = createPublicProjectionClient({ referenceRows: [referenceRow] });

    const page = await createReferencePublicRepository(client).listVerifiedReferences({
      projectId,
      cursor: null,
      limit: 20,
    });

    expect(client.relationCalls).toEqual(['public_project_references']);
    expect(client.eqFilters).toEqual([['project_id', projectId]]);
    expect(page).toEqual({
      version: 1,
      items: [
        publicProjectReferenceSchema.parse({
          projectId,
          referenceId,
          kind: 'official_site',
          label: '官方网站',
          url: 'https://example.com/',
          lastVerifiedAt: verifiedAt,
        }),
      ],
      nextCursor: null,
    });
  });

  it('prevents cursor drift by ordering and continuing on last verified time then reference id', async () => {
    const client = createPublicProjectionClient({
      referenceRows: [
        referenceRow,
        { ...referenceRow, reference_id: secondReferenceId, last_verified_at: earlierVerifiedAt },
      ],
    });
    const repository = createReferencePublicRepository(client);

    const firstPage = await repository.listVerifiedReferences({
      projectId,
      cursor: null,
      limit: 1,
    });
    const secondPage = await repository.listVerifiedReferences({
      projectId,
      cursor: firstPage.nextCursor,
      limit: 1,
    });

    expect(client.orders).toEqual([
      ['last_verified_at', { ascending: false }],
      ['reference_id', { ascending: false }],
      ['last_verified_at', { ascending: false }],
      ['reference_id', { ascending: false }],
    ]);
    expect(client.orFilters).toEqual([
      `last_verified_at.lt.${verifiedAt},and(last_verified_at.eq.${verifiedAt},reference_id.lt.${referenceId})`,
    ]);
    expect(firstPage.nextCursor).toBe(
      encodeCursor({ lastVerifiedAt: verifiedAt, referenceId }),
    );
    // The fake client cannot emulate PostgREST `or` semantics, so the row
    // continuity itself is a database guarantee proven by the integration
    // matrix. The unit boundary proves the emitted order, filter, and cursor.
    expect(secondPage.items).toHaveLength(1);
    expect(client.relationCalls).toEqual([
      'public_project_references',
      'public_project_references',
    ]);
  });

  it('prevents sensitive projection leaks by selecting only strict public reference columns', async () => {
    const client = createPublicProjectionClient({ referenceRows: [] });

    await createReferencePublicRepository(client).listVerifiedReferences({
      projectId,
      cursor: null,
      limit: 20,
    });

    expect(client.selections).toEqual([
      'reference_id,project_id,kind,label,url,last_verified_at',
    ]);
    expect(client.selections[0]).not.toMatch(
      /evidence|source|reviewer|actor|note|candidate|normalized|state|flag|withdraw|locator|hash|domain_authority/i,
    );
  });

  it('prevents mapping a reference row that carries internal fields', async () => {
    for (const extra of [
      { evidence_id: '33333333-3333-4333-8333-333333333333' },
      { normalized_domain: 'example.com' },
      { state: 'verified' },
      { note: 'internal reviewer note' },
      { active_indicator_id: null },
    ]) {
      const client = createPublicProjectionClient({
        referenceRows: [{ ...referenceRow, ...extra }],
      });

      await expect(
        createReferencePublicRepository(client).listVerifiedReferences({
          projectId,
          cursor: null,
          limit: 20,
        }),
        JSON.stringify(extra),
      ).rejects.toThrow(TypeError);
    }
  });

  it('prevents mapping a reference row whose public values are unsafe', async () => {
    for (const extra of [
      { last_verified_at: null },
      { url: 'http://example.com/' },
      { url: 'https://example.com/#fragment' },
      { kind: 'internal_only' },
    ]) {
      const client = createPublicProjectionClient({
        referenceRows: [{ ...referenceRow, ...extra }],
      });

      await expect(
        createReferencePublicRepository(client).listVerifiedReferences({
          projectId,
          cursor: null,
          limit: 20,
        }),
        JSON.stringify(extra),
      ).rejects.toThrow();
    }
  });

  it('prevents a cross-project reference row from escaping the requested project scope', async () => {
    const client = createPublicProjectionClient({
      referenceRows: [{ ...referenceRow, project_id: otherProjectId }],
    });

    await expect(
      createReferencePublicRepository(client).listVerifiedReferences({
        projectId,
        cursor: null,
        limit: 20,
      }),
    ).rejects.toThrow(TypeError);
  });

  it('returns an empty page with a null cursor when a project has no verified references', async () => {
    const client = createPublicProjectionClient({ referenceRows: [] });

    const page = await createReferencePublicRepository(client).listVerifiedReferences({
      projectId,
      cursor: null,
      limit: 20,
    });

    expect(page).toEqual({ version: 1, items: [], nextCursor: null });
  });

  it('rejects a cursor that is not an opaque public reference cursor', async () => {
    const repository = createReferencePublicRepository(
      createPublicProjectionClient({ referenceRows: [referenceRow] }),
    );

    for (const cursor of [
      'not-a-cursor',
      encodeCursor({ lastVerifiedAt: verifiedAt }),
      encodeCursor({ lastVerifiedAt: verifiedAt, referenceId, extra: true }),
      encodeCursor({ lastVerifiedAt: 'invalid', referenceId }),
    ]) {
      await expect(
        repository.listVerifiedReferences({ projectId, cursor, limit: 20 }),
        cursor,
      ).rejects.toThrow();
    }
  });

  it('prevents an unbounded or unbounded-by-zero public reference page', async () => {
    const repository = createReferencePublicRepository(
      createPublicProjectionClient({ referenceRows: [] }),
    );

    for (const limit of [0, 101, -1]) {
      await expect(
        repository.listVerifiedReferences({ projectId, cursor: null, limit }),
        String(limit),
      ).rejects.toThrow();
    }
  });

  it('prevents PostgREST details from escaping the public projection error boundary', async () => {
    const client = createPublicProjectionClient({
      referenceError: {
        code: '42501',
        message: 'reference decision reviewer=private',
        details: 'evidence_id=private',
        hint: 'internal note',
      },
    });

    const error = await createReferencePublicRepository(client)
      .listVerifiedReferences({ projectId, cursor: null, limit: 20 })
      .catch((cause: unknown) => cause);

    expect(error).toEqual(new ReferencePublicProjectionQueryError('42501'));
    expect(String(error)).not.toMatch(/reviewer|evidence|note|private/i);
  });
});

describe('ReferencePublicRepository.listGrantedDomainAuthorities', () => {
  it('prevents a public authority read from touching the authority base table', async () => {
    const client = createPublicProjectionClient({ authorityRows: [authorityRow] });

    const list = await createReferencePublicRepository(client).listGrantedDomainAuthorities({
      projectId,
      limit: 20,
    });

    expect(client.relationCalls).toEqual(['public_project_domain_authorities']);
    expect(client.eqFilters).toEqual([['project_id', projectId]]);
    expect(client.selections).toEqual(['authority_id,project_id,domain,granted_at']);
    expect(client.orders).toEqual([
      ['granted_at', { ascending: false }],
      ['authority_id', { ascending: false }],
    ]);
    expect(client.ranges).toEqual([[0, 19]]);
    expect(list).toEqual({
      version: 1,
      items: [
        publicProjectDomainAuthoritySchema.parse({
          projectId,
          authorityId,
          domain: 'example.com',
          grantedAt,
        }),
      ],
    });
  });

  it('prevents mapping an authority row that carries internal fields', async () => {
    for (const extra of [
      { state: 'revoked' },
      { reviewer_user_id: '44444444-4444-4444-8444-444444444444' },
      { normalized_domain: 'example.com' },
      { evidence_id: '33333333-3333-4333-8333-333333333333' },
    ]) {
      const client = createPublicProjectionClient({
        authorityRows: [{ ...authorityRow, ...extra }],
      });

      await expect(
        createReferencePublicRepository(client).listGrantedDomainAuthorities({
          projectId,
          limit: 20,
        }),
        JSON.stringify(extra),
      ).rejects.toThrow(TypeError);
    }
  });

  it('prevents mapping an authority row whose public values are unsafe', async () => {
    for (const extra of [
      { granted_at: null },
      { granted_at: 'yesterday' },
      { domain: '' },
      { project_id: otherProjectId },
    ]) {
      const client = createPublicProjectionClient({
        authorityRows: [{ ...authorityRow, ...extra }],
      });

      await expect(
        createReferencePublicRepository(client).listGrantedDomainAuthorities({
          projectId,
          limit: 20,
        }),
        JSON.stringify(extra),
      ).rejects.toThrow();
    }
  });

  it('prevents an unbounded or unbounded-by-zero public authority list', async () => {
    const repository = createReferencePublicRepository(
      createPublicProjectionClient({ authorityRows: [] }),
    );

    for (const limit of [0, 101]) {
      await expect(
        repository.listGrantedDomainAuthorities({ projectId, limit }),
        String(limit),
      ).rejects.toThrow();
    }
    expect(
      await repository.listGrantedDomainAuthorities({ projectId, limit: 1 }),
    ).toEqual({ version: 1, items: [] });
  });

  it('prevents PostgREST details from escaping the public authority error boundary', async () => {
    const client = createPublicProjectionClient({
      authorityError: {
        code: '42P01',
        message: 'authority decision reviewer=private',
        details: 'evidence_id=private',
        hint: 'internal note',
      },
    });

    const error = await createReferencePublicRepository(client)
      .listGrantedDomainAuthorities({ projectId, limit: 20 })
      .catch((cause: unknown) => cause);

    expect(error).toEqual(new ReferencePublicProjectionQueryError('42P01'));
    expect(String(error)).not.toMatch(/reviewer|evidence|note|private/i);
  });
});

interface FakePostgrestError {
  readonly code: string;
  readonly message: string;
  readonly details: string;
  readonly hint: string;
}

type TrackedClient = SupabaseClient<Database> & {
  readonly relationCalls: string[];
  readonly selections: string[];
  readonly orders: [string, { readonly ascending: boolean }][];
  readonly orFilters: string[];
  readonly eqFilters: [string, unknown][];
  readonly ranges: [number, number][];
};

function createPublicProjectionClient(options: {
  readonly referenceRows?: readonly unknown[];
  readonly authorityRows?: readonly unknown[];
  readonly referenceError?: FakePostgrestError;
  readonly authorityError?: FakePostgrestError;
}): TrackedClient {
  const relationCalls: string[] = [];
  const selections: string[] = [];
  const orders: [string, { readonly ascending: boolean }][] = [];
  const orFilters: string[] = [];
  const eqFilters: [string, unknown][] = [];
  const ranges: [number, number][] = [];

  function createQuery(relation: string) {
    const state = { from: 0, to: 0 };
    const query = {
      select(columns: string) {
        selections.push(columns);
        return query;
      },
      eq(column: string, value: unknown) {
        eqFilters.push([column, value]);
        return query;
      },
      order(column: string, options: { readonly ascending: boolean }) {
        orders.push([column, options]);
        return query;
      },
      or(filter: string) {
        orFilters.push(filter);
        return query;
      },
      range(from: number, to: number) {
        ranges.push([from, to]);
        state.from = from;
        state.to = to;
        return query;
      },
      then<TResult = { data: readonly unknown[] | null; error: FakePostgrestError | null }>(
        onfulfilled?:
          | ((
              value: { data: readonly unknown[] | null; error: FakePostgrestError | null },
            ) => TResult | PromiseLike<TResult>)
          | null,
        onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
      ) {
        const rows =
          relation === 'public_project_references'
            ? (options.referenceRows ?? [])
            : (options.authorityRows ?? []);
        const error =
          relation === 'public_project_references'
            ? (options.referenceError ?? null)
            : (options.authorityError ?? null);
        return Promise.resolve({
          data: error === null ? rows.slice(state.from, state.to + 1) : null,
          error,
        }).then(onfulfilled, onrejected);
      },
    };
    return query;
  }

  return {
    relationCalls,
    selections,
    orders,
    orFilters,
    eqFilters,
    ranges,
    from(relation: string) {
      relationCalls.push(relation);
      if (
        relation !== 'public_project_references'
        && relation !== 'public_project_domain_authorities'
      ) {
        throw new Error(`Public reference repository must not query ${relation}.`);
      }
      return createQuery(relation);
    },
  } as unknown as TrackedClient;
}

function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}
