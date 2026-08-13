import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSourceCollectionRepository } from '../collection/source-collection-repository.js';
import type {
  CollectionAttemptInput,
  DiscoveredItemInput,
  RawItemInput,
} from '../collection/types.js';

const projectId = '81000000-0000-4000-8000-000000000010';
const sourceId = '81000000-0000-4000-8000-000000000020';
const reviewerId = '81000000-0000-4000-8000-000000000090';
const attemptId = '81000000-0000-4000-8000-000000000001';
const rawItemId = '81000000-0000-4000-8000-000000000002';
const discoveryId = '81000000-0000-4000-8000-000000000003';
const successorId = '81000000-0000-4000-8000-000000000004';
const articleAttemptId = '81000000-0000-4000-8000-000000000005';
const articleRawItemId = '81000000-0000-4000-8000-000000000006';
const workerRole = 'source_collection_repository_test_worker';
const workerPassword = 'source-collection-repository-test-only';

const integrationDatabaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
const describeIntegration = integrationDatabaseUrl === undefined ? describe.skip : describe;

describeIntegration('SourceCollectionRepository PostgreSQL integration', () => {
  const owner = integrationDatabaseUrl === undefined ? null : postgres(integrationDatabaseUrl, { max: 1 });
  const worker = integrationDatabaseUrl === undefined
    ? null
    : postgres(integrationDatabaseUrl, { max: 1, user: workerRole, password: workerPassword });
  const repository = worker === null ? null : createSourceCollectionRepository(worker);

  beforeAll(async () => {
    if (owner === null) throw new Error('Database integration environment is unavailable.');
    await dropWorkerRole(owner);
    await owner`
      create role source_collection_repository_test_worker
      login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication
      password 'source-collection-repository-test-only'
    `;
    await owner`
      grant collection_worker to source_collection_repository_test_worker
      with admin false, inherit false, set true
    `;
    await removeFixtures(owner);
    await owner`
      insert into auth.users (
        id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        ${reviewerId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'repository-collection@example.invalid',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
      )
    `;
    await owner`
      insert into public.projects (id, slug, name, lifecycle)
      values (${projectId}::uuid, 'repository-collection', 'Repository Collection', 'active')
    `;
    await owner`
      insert into public.sources (id, source_type, name, canonical_url, status)
      values (${sourceId}::uuid, 'official_web', 'Repository Collection', 'https://repository-collection.example/', 'active')
    `;
    await owner`
      insert into public.project_sources (
        project_id, source_id, authority_domains, is_official, verified_at, verified_by
      ) values (
        ${projectId}::uuid, ${sourceId}::uuid, array['repository-collection.example'], true, now(), ${reviewerId}::uuid
      )
    `;
  });

  afterAll(async () => {
    if (owner === null || worker === null) return;
    try {
      await removeFixtures(owner);
    } finally {
      await worker.end({ timeout: 5 });
      try {
        await dropWorkerRole(owner);
      } finally {
        await owner.end({ timeout: 5 });
      }
    }
  });

  it('uses a non-privileged login that may set only its granted collection role', async () => {
    if (worker === null) throw new Error('Database integration environment is unavailable.');
    const rows = await worker`
      select current_user::text, session_user::text,
        usesuper, usebypassrls,
        pg_catalog.pg_has_role(session_user, 'collection_worker', 'SET') as may_set_worker
      from pg_catalog.pg_user where usename = session_user
    `;
    expect(rows[0]).toEqual({
      current_user: workerRole,
      session_user: workerRole,
      usesuper: false,
      usebypassrls: false,
      may_set_worker: true,
    });
  });

  it('loads context through real collection_worker RLS', async () => {
    if (repository === null) throw new Error('Database integration environment is unavailable.');
    await expect(repository.loadContext(projectId, sourceId)).resolves.toEqual({
      projectId,
      sourceId,
      canonicalUrl: 'https://repository-collection.example/',
      authorityDomains: ['repository-collection.example'],
    });
  });

  it('rolls back an endpoint attempt when its raw item is invalid', async () => {
    if (repository === null || owner === null) throw new Error('Database integration environment is unavailable.');
    await expect(repository.commitEndpoint({
      attempt: endpointAttempt(),
      rawItem: { ...rawItem(), sha256: 'bad' },
      existingRawItemId: null,
    }))
      .rejects.toMatchObject({ code: 'persistence_failed', message: 'persistence_failed' });
    const attempts = await owner`select id from public.collection_attempts where id = ${attemptId}::uuid`;
    expect(attempts).toHaveLength(0);
  });

  it('replays idempotently and reuses matching content hashes', async () => {
    if (repository === null || owner === null) throw new Error('Database integration environment is unavailable.');
    const first = await repository.commitEndpoint({
      attempt: endpointAttempt(), rawItem: rawItem(), existingRawItemId: null,
    });
    const replay = await repository.commitEndpoint({
      attempt: { ...endpointAttempt(), id: '81000000-0000-4000-8000-000000000099' },
      rawItem: { ...rawItem(), id: '81000000-0000-4000-8000-000000000098' },
      existingRawItemId: null,
    });
    await expect(repository.commitEndpoint({
      attempt: {
        ...endpointAttempt(),
        projectId: '81000000-0000-4000-8000-000000000099',
      },
      rawItem: null,
      existingRawItemId: null,
    })).rejects.toMatchObject({ code: 'persistence_failed' });
    const reuse = await repository.commitEndpoint({
      attempt: { ...endpointAttempt(), id: '81000000-0000-4000-8000-000000000097', idempotencyKey: 'repository:hash-reuse' },
      rawItem: { ...rawItem(), id: '81000000-0000-4000-8000-000000000096' },
      existingRawItemId: null,
    });
    const revalidated = await repository.commitEndpoint({
      attempt: {
        ...endpointAttempt(),
        id: '81000000-0000-4000-8000-000000000095',
        idempotencyKey: 'repository:not-modified',
        httpStatus: 304,
        etag: '"v2"',
        outcome: 'not_modified',
        completedAt: '2026-08-12T00:00:02.000Z',
        collectedAt: '2026-08-12T00:00:02.000Z',
      },
      rawItem: null,
      existingRawItemId: rawItemId,
    });
    const latest = await repository.loadLatest(
      'https://repository-collection.example/',
      projectId,
      sourceId,
    );

    expect(replay).toEqual(first);
    expect(reuse.rawItemId).toBe(rawItemId);
    expect(revalidated.rawItemId).toBe(rawItemId);
    expect(latest).toMatchObject({ id: rawItemId, etag: '"v2"' });
    const rows = await owner`
      select
        (select count(*)::integer from public.collection_attempts where project_id = ${projectId}::uuid) as attempts,
        (select count(*)::integer from public.raw_items where project_id = ${projectId}::uuid) as raws
    `;
    expect(rows[0]).toMatchObject({ attempts: 3, raws: 1 });
  });

  it('atomically commits feed discovery and an article successor', async () => {
    if (repository === null || owner === null) throw new Error('Database integration environment is unavailable.');
    const feedRaw = { ...rawItem(), id: '81000000-0000-4000-8000-000000000012', contentKind: 'rss_feed' as const, sha256: 'b'.repeat(64) };
    const feedAttempt = { ...endpointAttempt(), id: '81000000-0000-4000-8000-000000000011', idempotencyKey: 'repository:feed', discoveredCount: 1 };
    const discovery = discoveryInput(feedRaw.id);
    const firstFeed = await repository.commitFeed({ attempt: feedAttempt, rawItem: feedRaw, discoveries: [discovery] });
    const replayedFeed = await repository.commitFeed({ attempt: feedAttempt, rawItem: feedRaw, discoveries: [discovery] });
    expect(replayedFeed).toEqual(firstFeed);

    await repository.commitArticleOutcome({
      attempt: {
        ...endpointAttempt(), id: articleAttemptId, idempotencyKey: 'repository:article', parentDiscoveredItemId: discoveryId,
      },
      rawItem: {
        ...rawItem(), id: articleRawItemId, logicalUrl: 'https://repository-collection.example/article',
        finalUrl: 'https://repository-collection.example/article', contentKind: 'feed_article_html',
        parentDiscoveredItemId: discoveryId, sha256: 'c'.repeat(64),
      },
      discovery: {
        ...discovery, id: successorId, version: 2, supersedesDiscoveredItemId: discoveryId,
        disposition: 'fetched', articleCollectionAttemptId: articleAttemptId, articleRawItemId: null,
      },
    });

    const versions = await owner`
      select id::text, version, supersedes_discovered_item_id::text, article_raw_item_id::text
      from public.discovered_items where project_id = ${projectId}::uuid order by version
    `;
    expect(versions).toEqual([
      { id: discoveryId, version: 1, supersedes_discovered_item_id: null, article_raw_item_id: null },
      { id: successorId, version: 2, supersedes_discovered_item_id: discoveryId, article_raw_item_id: articleRawItemId },
    ]);
  });

  it('cannot mutate append-only history through the worker role', async () => {
    if (worker === null) throw new Error('Database integration environment is unavailable.');
    await expect(worker.begin(async (sql) => {
      await sql`set local role collection_worker`;
      await sql`update public.raw_items set raw_text = 'changed' where id = ${rawItemId}::uuid`;
    })).rejects.toThrow();
  });
});

function endpointAttempt(): CollectionAttemptInput {
  return {
    id: attemptId, projectId, sourceId, parentDiscoveredItemId: null,
    idempotencyKey: 'repository:endpoint', requestedUrl: 'https://repository-collection.example/',
    finalUrl: 'https://repository-collection.example/', redirectChain: [],
    startedAt: '2026-08-12T00:00:00.000Z', completedAt: '2026-08-12T00:00:01.000Z',
    collectedAt: '2026-08-12T00:00:01.000Z', httpStatus: 200, mediaType: 'text/html',
    etag: '"v1"', lastModified: null, decompressedBytes: 15, outcome: 'stored_new_content',
    errorCode: null, errorDetail: null, discoveredCount: 0, bodyFetchCount: 0,
  };
}

async function dropWorkerRole(sql: postgres.Sql): Promise<void> {
  await sql`drop role if exists source_collection_repository_test_worker`;
}

function rawItem(): RawItemInput {
  return {
    id: rawItemId, projectId, sourceId, parentDiscoveredItemId: null,
    logicalUrl: 'https://repository-collection.example/', finalUrl: 'https://repository-collection.example/',
    contentKind: 'official_html', mediaType: 'text/html', rawText: '<html/>', sha256: 'a'.repeat(64),
    publishedAt: null, collectedAt: '2026-08-12T00:00:01.000Z',
  };
}

function discoveryInput(feedRawItemId: string): DiscoveredItemInput {
  return {
    id: discoveryId, projectId, sourceId, feedRawItemId, stableEntryKey: 'entry-1', version: 1,
    supersedesDiscoveredItemId: null, entryUrl: 'https://repository-collection.example/article',
    title: 'Article', summary: null, author: null, externalEntryId: 'entry-1', publishedAt: null,
    updatedAt: null, isAuthorityDomain: true, disposition: 'eligible',
    articleCollectionAttemptId: null, articleRawItemId: null,
  };
}

async function removeFixtures(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (transaction) => {
    await transaction`set local session_replication_role = replica`;
    await transaction`delete from public.discovered_items where project_id = ${projectId}::uuid`;
    await transaction`delete from public.collection_attempts where project_id = ${projectId}::uuid`;
    await transaction`delete from public.raw_items where project_id = ${projectId}::uuid`;
    await transaction`delete from public.project_sources where project_id = ${projectId}::uuid`;
    await transaction`delete from public.sources where id = ${sourceId}::uuid`;
    await transaction`delete from public.projects where id = ${projectId}::uuid`;
    await transaction`
      delete from public.user_roles
      where user_id = ${reviewerId}::uuid or granted_by = ${reviewerId}::uuid
    `;
    await transaction`delete from public.profiles where id = ${reviewerId}::uuid`;
    await transaction`delete from auth.users where id = ${reviewerId}::uuid`;
  });
}
