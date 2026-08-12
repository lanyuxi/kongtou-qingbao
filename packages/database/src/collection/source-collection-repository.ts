import { collectSourceResultSchema, type CollectSourceResult } from '@airdrop/contracts';
import type { Sql, TransactionSql } from 'postgres';

import type { Database } from '../generated/database.types.js';
import {
  redirectChainAsJson,
  type CollectionAttemptInput,
  type CommitEndpointInput,
  type DiscoveredItemInput,
  type LatestRawItem,
  type RawItemInput,
  type SourceCollectionContext,
  type SourceCollectionRepository,
} from './types.js';

type CollectionAttemptRow = Database['public']['Tables']['collection_attempts']['Row'];

export interface CollectionTransaction {
  setCollectionWorkerRole(): Promise<void>;
  lockIdempotencyKey(idempotencyKey: string): Promise<void>;
  loadContext(projectId: string, sourceId: string): Promise<SourceCollectionContext | null>;
  findCommitted(idempotencyKey: string): Promise<CollectSourceResult | null>;
  loadDiscoveryIds(feedRawItemId: string): Promise<readonly string[]>;
  loadLatest(logicalUrl: string, projectId: string, sourceId: string): Promise<LatestRawItem | null>;
  insertRawItem(rawItem: RawItemInput): Promise<string>;
  insertAttempt(attempt: CollectionAttemptInput, rawItemId: string | null): Promise<void>;
  insertDiscoveries(discoveries: readonly DiscoveredItemInput[]): Promise<void>;
}

export interface CollectionTransactionRunner {
  <T>(work: (transaction: CollectionTransaction) => Promise<T>): Promise<T>;
}

export class SourceCollectionPersistenceError extends Error {
  readonly code = 'persistence_failed' as const;

  constructor(message: 'persistence_failed') {
    super(message);
    this.name = 'SourceCollectionPersistenceError';
  }
}

export function createSourceCollectionRepository(sql: Sql): SourceCollectionRepository {
  const runTransaction: CollectionTransactionRunner = async <T>(
    work: (transaction: CollectionTransaction) => Promise<T>,
  ): Promise<T> => {
    const result = await sql.begin(async (transactionSql) => [
      await work(createPostgresTransaction(transactionSql)),
    ] as const);
    return result[0];
  };
  return createSourceCollectionRepositoryFromTransactions(runTransaction);
}

export function createSourceCollectionRepositoryFromTransactions(
  runTransaction: CollectionTransactionRunner,
): SourceCollectionRepository {
  const run = async <T>(work: (transaction: CollectionTransaction) => Promise<T>): Promise<T> => {
    try {
      return await runTransaction(async (transaction) => {
        await transaction.setCollectionWorkerRole();
        return work(transaction);
      });
    } catch {
      throw new SourceCollectionPersistenceError('persistence_failed');
    }
  };

  const commitEndpoint = (input: CommitEndpointInput): Promise<CollectSourceResult> =>
    run((transaction) =>
      commitAttempt(transaction, input.attempt, input.rawItem, input.existingRawItemId),
    );

  return {
    loadContext: (projectId, sourceId) =>
      run((transaction) => transaction.loadContext(projectId, sourceId)),
    findCommitted: (idempotencyKey) =>
      run((transaction) => transaction.findCommitted(idempotencyKey)),
    loadLatest: (logicalUrl, projectId, sourceId) =>
      run((transaction) => transaction.loadLatest(logicalUrl, projectId, sourceId)),
    commitEndpoint,
    commitFeed: (input) =>
      run(async (transaction) => {
        const committed = await findForCommit(transaction, input.attempt);
        if (committed !== null) {
          if (committed.rawItemId === null) {
            throw new Error('committed_feed_raw_item_required');
          }
          return {
            result: committed,
            discoveryIds: await transaction.loadDiscoveryIds(committed.rawItemId),
          };
        }
        const rawItemId = await transaction.insertRawItem(input.rawItem);
        await transaction.insertAttempt(input.attempt, rawItemId);
        const discoveries = input.discoveries.map((discovery) => ({
          ...discovery,
          feedRawItemId: rawItemId,
        }));
        await transaction.insertDiscoveries(discoveries);
        return {
          result: buildResult(input.attempt, rawItemId),
          discoveryIds: discoveries.map(({ id }) => id),
        };
      }),
    commitArticleOutcome: (input) =>
      run(async (transaction) => {
        const committed = await findForCommit(transaction, input.attempt);
        if (committed !== null) {
          return;
        }
        const rawItemId = input.rawItem === null ? null : await transaction.insertRawItem(input.rawItem);
        await transaction.insertAttempt(input.attempt, rawItemId);
        await transaction.insertDiscoveries([
          {
            ...input.discovery,
            articleCollectionAttemptId: input.attempt.id,
            articleRawItemId: rawItemId,
          },
        ]);
      }),
  };
}

async function commitAttempt(
  transaction: CollectionTransaction,
  attempt: CollectionAttemptInput,
  rawItem: RawItemInput | null,
  existingRawItemId: string | null,
): Promise<CollectSourceResult> {
  validateEndpointRawItemReference(attempt, rawItem, existingRawItemId);
  const committed = await findForCommit(transaction, attempt);
  if (committed !== null) {
    return committed;
  }
  const rawItemId = rawItem === null ? existingRawItemId : await transaction.insertRawItem(rawItem);
  await transaction.insertAttempt(attempt, rawItemId);
  return buildResult(attempt, rawItemId);
}

function validateEndpointRawItemReference(
  attempt: CollectionAttemptInput,
  rawItem: RawItemInput | null,
  existingRawItemId: string | null,
): void {
  const expectsNew = attempt.outcome === 'stored_new_content';
  const expectsExisting =
    attempt.outcome === 'not_modified' || attempt.outcome === 'unchanged_content';
  if (
    (expectsNew && (rawItem === null || existingRawItemId !== null)) ||
    (expectsExisting && (rawItem !== null || existingRawItemId === null)) ||
    (!expectsNew && !expectsExisting && (rawItem !== null || existingRawItemId !== null))
  ) {
    throw new Error('endpoint_raw_item_reference_invalid');
  }
}

async function findForCommit(
  transaction: CollectionTransaction,
  attempt: CollectionAttemptInput,
): Promise<CollectSourceResult | null> {
  await transaction.lockIdempotencyKey(attempt.idempotencyKey);
  const committed = await transaction.findCommitted(attempt.idempotencyKey);
  if (
    committed !== null &&
    (committed.projectId !== attempt.projectId || committed.sourceId !== attempt.sourceId)
  ) {
    throw new Error('committed_aggregate_mismatch');
  }
  return committed;
}

function buildResult(attempt: CollectionAttemptInput, rawItemId: string | null): CollectSourceResult {
  return collectSourceResultSchema.parse({
    attemptId: attempt.id,
    projectId: attempt.projectId,
    sourceId: attempt.sourceId,
    outcome: attempt.outcome,
    rawItemId,
    discoveredCount: attempt.discoveredCount,
    bodyFetchCount: attempt.bodyFetchCount,
  });
}

function createPostgresTransaction(sql: TransactionSql): CollectionTransaction {
  return {
    setCollectionWorkerRole: async () => {
      await sql`set local role collection_worker`;
    },
    lockIdempotencyKey: async (idempotencyKey) => {
      await sql`select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${idempotencyKey}, 0))`;
    },
    loadContext: async (projectId, sourceId) => {
      const rows = await sql<
        readonly {
          project_id: string;
          source_id: string;
          canonical_url: string;
          authority_domains: string[];
        }[]
      >`select * from public.load_source_collection_context(${projectId}::uuid, ${sourceId}::uuid)`;
      const row = rows[0];
      return row === undefined
        ? null
        : {
            projectId: row.project_id,
            sourceId: row.source_id,
            canonicalUrl: row.canonical_url,
            authorityDomains: row.authority_domains,
          };
    },
    findCommitted: async (idempotencyKey) => {
      const rows = await sql<readonly CollectionAttemptRow[]>`
        select * from public.collection_attempts where idempotency_key = ${idempotencyKey} limit 1
      `;
      return rows[0] === undefined ? null : resultFromRow(rows[0]);
    },
    loadDiscoveryIds: async (feedRawItemId) => {
      const rows = await sql<readonly { id: string }[]>`
        select id from public.discovered_items
        where feed_raw_item_id = ${feedRawItemId}::uuid
          and version = 1
        order by created_at, id
      `;
      return rows.map(({ id }) => id);
    },
    loadLatest: async (logicalUrl, projectId, sourceId) => {
      const rows = await sql<
        readonly {
          id: string;
          logical_url: string;
          final_url: string;
          sha256: string;
          collected_at: string;
          etag: string | null;
          last_modified: string | null;
        }[]
      >`
        select raw.id, raw.logical_url, raw.final_url, raw.sha256, raw.collected_at,
          attempt.etag, attempt.last_modified
        from public.raw_items as raw
        left join lateral (
          select collection_attempts.etag, collection_attempts.last_modified
          from public.collection_attempts
          where collection_attempts.raw_item_id = raw.id
          order by collection_attempts.collected_at desc, collection_attempts.id desc
          limit 1
        ) as attempt on true
        where raw.project_id = ${projectId}::uuid
          and raw.source_id = ${sourceId}::uuid
          and raw.logical_url = ${logicalUrl}
        order by raw.collected_at desc, raw.id desc
        limit 1
      `;
      const row = rows[0];
      return row === undefined
        ? null
        : {
            id: row.id,
            logicalUrl: row.logical_url,
            finalUrl: row.final_url,
            sha256: row.sha256,
            etag: row.etag,
            lastModified: row.last_modified,
            collectedAt: row.collected_at,
          };
    },
    insertRawItem: async (rawItem) => {
      const insertedRows = await sql<readonly { id: string }[]>`
        insert into public.raw_items (
          id, project_id, source_id, parent_discovered_item_id, logical_url, final_url,
          content_kind, media_type, raw_text, sha256, published_at, collected_at
        ) values (
          ${rawItem.id}::uuid, ${rawItem.projectId}::uuid, ${rawItem.sourceId}::uuid,
          ${rawItem.parentDiscoveredItemId}::uuid, ${rawItem.logicalUrl}, ${rawItem.finalUrl},
          ${rawItem.contentKind}, ${rawItem.mediaType}, ${rawItem.rawText}, ${rawItem.sha256},
          ${rawItem.publishedAt}::timestamptz, ${rawItem.collectedAt}::timestamptz
        )
        on conflict (project_id, source_id, logical_url, sha256)
        do nothing
        returning id
      `;
      const existingRows = insertedRows[0] === undefined
        ? await sql<readonly { id: string }[]>`
            select id from public.raw_items
            where project_id = ${rawItem.projectId}::uuid
              and source_id = ${rawItem.sourceId}::uuid
              and logical_url = ${rawItem.logicalUrl}
              and sha256 = ${rawItem.sha256}
            limit 1
          `
        : insertedRows;
      const row = existingRows[0];
      if (row === undefined) {
        throw new Error('raw_item_not_returned');
      }
      return row.id;
    },
    insertAttempt: async (attempt, rawItemId) => {
      await sql`
        insert into public.collection_attempts (
          id, project_id, source_id, parent_discovered_item_id, idempotency_key,
          requested_url, final_url, redirect_chain, started_at, completed_at, collected_at,
          http_status, media_type, etag, last_modified, decompressed_bytes, outcome,
          error_code, error_detail, raw_item_id, discovered_count, body_fetch_count
        ) values (
          ${attempt.id}::uuid, ${attempt.projectId}::uuid, ${attempt.sourceId}::uuid,
          ${attempt.parentDiscoveredItemId}::uuid, ${attempt.idempotencyKey},
          ${attempt.requestedUrl}, ${attempt.finalUrl}, ${sql.json(redirectChainAsJson(attempt.redirectChain))},
          ${attempt.startedAt}::timestamptz, ${attempt.completedAt}::timestamptz,
          ${attempt.collectedAt}::timestamptz, ${attempt.httpStatus}, ${attempt.mediaType},
          ${attempt.etag}, ${attempt.lastModified}, ${attempt.decompressedBytes}, ${attempt.outcome},
          ${attempt.errorCode}, ${attempt.errorDetail}, ${rawItemId}::uuid,
          ${attempt.discoveredCount}, ${attempt.bodyFetchCount}
        )
      `;
    },
    insertDiscoveries: async (discoveries) => {
      for (const discovery of discoveries) {
        await insertDiscovery(sql, discovery);
      }
    },
  };
}

async function insertDiscovery(sql: TransactionSql, discovery: DiscoveredItemInput): Promise<void> {
  await sql`
    insert into public.discovered_items (
      id, project_id, source_id, feed_raw_item_id, stable_entry_key, version,
      supersedes_discovered_item_id, entry_url, title, summary, author, external_entry_id,
      published_at, updated_at, is_authority_domain, disposition,
      article_collection_attempt_id, article_raw_item_id
    ) values (
      ${discovery.id}::uuid, ${discovery.projectId}::uuid, ${discovery.sourceId}::uuid,
      ${discovery.feedRawItemId}::uuid, ${discovery.stableEntryKey}, ${discovery.version},
      ${discovery.supersedesDiscoveredItemId}::uuid, ${discovery.entryUrl}, ${discovery.title},
      ${discovery.summary}, ${discovery.author}, ${discovery.externalEntryId},
      ${discovery.publishedAt}::timestamptz, ${discovery.updatedAt}::timestamptz,
      ${discovery.isAuthorityDomain}, ${discovery.disposition},
      ${discovery.articleCollectionAttemptId}::uuid, ${discovery.articleRawItemId}::uuid
    )
  `;
}

function resultFromRow(row: CollectionAttemptRow): CollectSourceResult {
  return collectSourceResultSchema.parse({
    attemptId: row.id,
    projectId: row.project_id,
    sourceId: row.source_id,
    outcome: row.outcome,
    rawItemId: row.raw_item_id,
    discoveredCount: row.discovered_count,
    bodyFetchCount: row.body_fetch_count,
  });
}
