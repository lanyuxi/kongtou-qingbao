import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  CollectSourceJob,
  CollectSourceResult,
} from '@airdrop/contracts';
import { collectorIdempotencyKey, deterministicJitterSeconds } from '@airdrop/domain';
import {
  createDurableCollectionQueueRepository,
  type DurableCollectionQueueRepository,
  type ReconcileResult,
} from '@airdrop/database/collection-queue-worker';
import {
  createSourceCollectionRepository,
} from '@airdrop/database/collection-worker';

import {
  createCollectSource,
  createNodeContentHasher,
} from '../../collection/collect-source.js';
import { createFeedParser } from '../../collection/feed-parser.js';
import type {
  SafeHttpClient,
  SafeHttpRequest,
  SafeHttpResponse,
} from '../../collection/ports.js';
import type { CollectionJobProcessor } from '../process-collection-job.js';
import { createCollectionJobProcessor } from '../process-collection-job.js';
import { createScheduler } from '../run-scheduler.js';
import type { Clock, ProcessorTimer, QueueLogger, SchedulerTimer } from '../ports.js';

const projectIdA = '83000000-0000-4000-8000-000000000010';
const sourceIdA = '83000000-0000-4000-8000-000000000020';
const projectIdB = '83000000-0000-4000-8000-000000000011';
const sourceIdB = '83000000-0000-4000-8000-000000000021';
const reviewerId = '83000000-0000-4000-8000-000000000090';
const queueRole = 'automatic_collection_e2e_queue';
const queuePassword = 'automatic-collection-e2e-queue-only';
const collectorRole = 'automatic_collection_e2e_collector';
const collectorPassword = 'automatic-collection-e2e-collector-only';

const scanTime = new Date('2026-08-15T00:00:00.000Z');
const claimTimeA = new Date('2026-08-15T00:04:00.000Z');
const processTimeA = new Date('2026-08-15T00:04:10.000Z');
const claimTimeB = new Date('2026-08-15T00:06:30.000Z');
const recoveryTime = new Date('2026-08-15T00:08:31.000Z');
const processTimeB = new Date('2026-08-15T00:08:40.000Z');
const scheduledForMicrosecondText = `${scanTime.toISOString().slice(0, 23)}000Z`;

const htmlBody = '<!doctype html><html lang="en"><body><main>Airdrop announcement page.</main></body></html>';
const htmlBytes = new TextEncoder().encode(htmlBody);

const integrationDatabaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
const describeIntegration = integrationDatabaseUrl === undefined ? describe.skip : describe;

const silentLogger: QueueLogger = {
  info: () => undefined,
  error: () => undefined,
};

const immediateSchedulerTimer: SchedulerTimer = {
  sleep: async () => undefined,
};

const abortOnlyProcessorTimer: ProcessorTimer = {
  sleep: (_milliseconds, signal) => new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => resolve(), { once: true });
  }),
};

const fixedClock = (at: Date): Clock => ({ now: () => at });

function withDatabaseCredentials(databaseUrl: string, username: string, password: string): string {
  const parsed = new URL(databaseUrl);
  parsed.username = username;
  parsed.password = password;
  return parsed.href;
}

describeIntegration('automatic collection end-to-end with a disposable database', () => {
  const owner = integrationDatabaseUrl === undefined
    ? null
    : postgres(integrationDatabaseUrl, { max: 1 });
  const queueRepositoryWithClose = integrationDatabaseUrl === undefined
    ? null
    : createDurableCollectionQueueRepository(
      withDatabaseCredentials(integrationDatabaseUrl, queueRole, queuePassword),
    );
  const collectorSql = integrationDatabaseUrl === undefined
    ? null
    : postgres(
      withDatabaseCredentials(integrationDatabaseUrl, collectorRole, collectorPassword),
      { max: 2, idle_timeout: 20, connect_timeout: 5 },
    );

  const httpCalls: SafeHttpRequest[] = [];
  const fakeHttp: SafeHttpClient = {
    get: async (input) => {
      httpCalls.push(input);
      const response: SafeHttpResponse = {
        requestedUrl: input.url,
        finalUrl: input.url,
        redirects: [],
        status: 200,
        mediaTypeHeader: 'text/html; charset=utf-8',
        etag: null,
        lastModified: null,
        body: htmlBytes,
        decompressedBytes: htmlBytes.byteLength,
      };
      return response;
    },
  };

  const ids = { generate: () => randomUUID() };
  let processClockNow = processTimeA;
  const processorClock: Clock = { now: () => processClockNow };

  let queueRepository: DurableCollectionQueueRepository;
  let collect: (job: CollectSourceJob) => Promise<CollectSourceResult>;
  let scheduler: { scanOnce(): Promise<ReconcileResult> };
  let processor: CollectionJobProcessor;

  beforeAll(async () => {
    if (owner === null || queueRepositoryWithClose === null || collectorSql === null) {
      throw new Error('Database integration environment is unavailable.');
    }
    queueRepository = queueRepositoryWithClose;
    collect = createCollectSource({
      repository: createSourceCollectionRepository(collectorSql),
      http: fakeHttp,
      feedParser: createFeedParser(),
      hasher: createNodeContentHasher(),
      clock: fixedClock(processTimeA),
      ids,
    });
    scheduler = createScheduler({
      repository: queueRepository,
      clock: fixedClock(scanTime),
      timer: immediateSchedulerTimer,
      logger: silentLogger,
    });
    processor = createCollectionJobProcessor({
      repository: queueRepository,
      collector: { collect },
      clock: processorClock,
      timer: abortOnlyProcessorTimer,
      ids,
      logger: silentLogger,
    });

    await removeFixtures(owner);
    await dropWorkerRoles(owner);
    await owner`
      create role automatic_collection_e2e_queue
      login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication
      password 'automatic-collection-e2e-queue-only'
    `;
    await owner`
      grant collection_queue_worker to automatic_collection_e2e_queue
      with admin false, inherit false, set true
    `;
    await owner`
      create role automatic_collection_e2e_collector
      login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication
      password 'automatic-collection-e2e-collector-only'
    `;
    await owner`
      grant collection_worker to automatic_collection_e2e_collector
      with admin false, inherit false, set true
    `;
    await insertReviewer(owner);
    await cleanSeedQueueLeftovers(owner);
    await owner`
      update public.sources set status = 'suspended'
      where id in (
        '90000000-0000-4000-8000-000000000020'::uuid,
        '90000000-0000-4000-8000-000000000021'::uuid
      )
    `;
    await insertOfficialRelationship(owner, projectIdA, sourceIdA, 'e2e-automatic-a');
    await insertOfficialRelationship(owner, projectIdB, sourceIdB, 'e2e-automatic-b');
  });

  afterAll(async () => {
    if (owner === null || queueRepositoryWithClose === null || collectorSql === null) return;
    try {
      await removeFixtures(owner);
      await owner`
        update public.sources set status = 'active'
        where id in (
          '90000000-0000-4000-8000-000000000020'::uuid,
          '90000000-0000-4000-8000-000000000021'::uuid
        )
      `;
    } finally {
      await queueRepositoryWithClose.close();
      await collectorSql.end({ timeout: 5 });
      try {
        await dropWorkerRoles(owner);
      } finally {
        await owner.end({ timeout: 5 });
      }
    }
  });

  it('reconciles an eligible official relationship into a scheduled durable job and completes it', async () => {
    if (owner === null) throw new Error('Database integration environment is unavailable.');

    const reconciliation = await scheduler.scanOnce();
    expect(reconciliation).toEqual({
      createdScheduleCount: 2,
      enqueuedCount: 2,
      canceledCount: 0,
      lockAcquired: true,
    });

    const scheduleRows = await owner<readonly {
      next_run_at: Date;
      interval_seconds: number;
      enabled: boolean;
      last_enqueued_at: Date | null;
    }[]>`
      select next_run_at, interval_seconds, enabled, last_enqueued_at
      from public.source_collection_schedules
      where project_id = ${projectIdA}::uuid
    `;
    expect(scheduleRows).toHaveLength(1);
    const [scheduleRow] = scheduleRows;
    if (scheduleRow === undefined) throw new Error('expected one schedule row');
    expect(scheduleRow.interval_seconds).toBe(1_800);
    expect(scheduleRow.enabled).toBe(true);
    expect(scheduleRow.next_run_at.getTime()).toBe(scanTime.getTime() + 1_800_000);
    expect(scheduleRow.last_enqueued_at?.getTime()).toBe(scanTime.getTime());

    const expectedJitterSeconds = deterministicJitterSeconds({
      projectId: projectIdA,
      sourceId: sourceIdA,
      scheduledFor: scanTime.toISOString(),
      intervalSeconds: 1_800,
    });
    const jobRows = await owner<readonly {
      id: string;
      state: string;
      available_at: Date;
      execution_attempt: number;
      delivery_count: number;
    }[]>`
      select id, state, available_at, execution_attempt, delivery_count
      from public.durable_jobs
      where project_id = ${projectIdA}::uuid
    `;
    expect(jobRows).toHaveLength(1);
    const [jobRow] = jobRows;
    if (jobRow === undefined) throw new Error('expected one durable job row');
    expect(jobRow.state).toBe('queued');
    expect(jobRow.execution_attempt).toBe(0);
    expect(jobRow.delivery_count).toBe(0);
    expect(jobRow.available_at.getTime())
      .toBe(scanTime.getTime() + expectedJitterSeconds * 1_000);

    const claimed = await queueRepository.claim('e2e-worker-a', claimTimeA, 10);
    expect(claimed).toHaveLength(2);
    const jobA = claimed.find((job) => job.payload.projectId === projectIdA);
    if (jobA === undefined) throw new Error('expected the first scenario job to be claimed');
    expect(jobA.executionAttempt).toBe(1);
    expect(jobA.deliveryCount).toBe(1);
    expect(jobA.payload.scheduledFor).toBe(scheduledForMicrosecondText);

    await processor.process(jobA, new AbortController().signal);

    expect(httpCalls.map((call) => call.url)).toEqual(['https://e2e-automatic-a.example/']);

    const attemptRows = await owner<readonly {
      idempotency_key: string;
      outcome: string;
      http_status: number | null;
    }[]>`
      select idempotency_key, outcome, http_status
      from public.collection_attempts
      where project_id = ${projectIdA}::uuid
    `;
    expect(attemptRows).toHaveLength(1);
    const [attemptRow] = attemptRows;
    if (attemptRow === undefined) throw new Error('expected one collection attempt row');
    expect(attemptRow.outcome).toBe('stored_new_content');
    expect(attemptRow.http_status).toBe(200);
    expect(attemptRow.idempotency_key).toBe(collectorIdempotencyKey(jobA.jobId, 1));

    const rawItemRows = await owner<readonly {
      content_kind: string;
      logical_url: string;
    }[]>`
      select content_kind, logical_url
      from public.raw_items
      where project_id = ${projectIdA}::uuid
    `;
    expect(rawItemRows).toHaveLength(1);
    const [rawItemRow] = rawItemRows;
    if (rawItemRow === undefined) throw new Error('expected one raw item row');
    expect(rawItemRow.content_kind).toBe('official_html');
    expect(rawItemRow.logical_url).toBe('https://e2e-automatic-a.example/');

    const completedRows = await owner<readonly {
      state: string;
      last_result_code: string | null;
      completed_at: Date | null;
    }[]>`
      select state, last_result_code, completed_at
      from public.durable_jobs
      where id = ${jobA.jobId}::uuid
    `;
    expect(completedRows).toHaveLength(1);
    const [completedRow] = completedRows;
    if (completedRow === undefined) throw new Error('expected the completed job row');
    expect(completedRow.state).toBe('succeeded');
    expect(completedRow.last_result_code).toBe('stored_new_content');
    expect(completedRow.completed_at).not.toBeNull();

    const eventTypes = await owner<readonly { event_type: string }[]>`
      select event_type
      from public.durable_job_events
      where job_id = ${jobA.jobId}::uuid
    `;
    expect(eventTypes.map((row) => row.event_type)).toEqual(
      expect.arrayContaining(['enqueued', 'claimed', 'succeeded']),
    );

    const cursorAfterCompletion = await owner<readonly { next_run_at: Date }[]>`
      select next_run_at
      from public.source_collection_schedules
      where project_id = ${projectIdA}::uuid
    `;
    expect(cursorAfterCompletion).toHaveLength(1);
    const [cursorRow] = cursorAfterCompletion;
    if (cursorRow === undefined) throw new Error('expected one schedule cursor row');
    expect(cursorRow.next_run_at.getTime())
      .toBe(scanTime.getTime() + 1_800_000);

    // Duplicate reconciliation of the same scheduling window must be a no-op:
    // rewind the cursor and rescan; the idempotency key keeps the logical job
    // unique and the cursor must not advance again.
    await owner`
      update public.source_collection_schedules
      set next_run_at = ${scanTime.toISOString()}::timestamptz
      where project_id = ${projectIdA}::uuid
    `;
    const replay = await scheduler.scanOnce();
    expect(replay).toEqual({
      createdScheduleCount: 0,
      enqueuedCount: 0,
      canceledCount: 0,
      lockAcquired: true,
    });
    const replayCursor = await owner<readonly { next_run_at: Date }[]>`
      select next_run_at
      from public.source_collection_schedules
      where project_id = ${projectIdA}::uuid
    `;
    expect(replayCursor).toHaveLength(1);
    const [replayCursorRow] = replayCursor;
    if (replayCursorRow === undefined) throw new Error('expected one replay cursor row');
    expect(replayCursorRow.next_run_at.getTime()).toBe(scanTime.getTime());

    const replayJobRows = await owner<readonly { id: string }[]>`
      select id from public.durable_jobs where project_id = ${projectIdA}::uuid
    `;
    expect(replayJobRows).toHaveLength(1);
  });

  it('redelivers after a crash between Collector commit and queue success with zero additional HTTP', async () => {
    if (owner === null) throw new Error('Database integration environment is unavailable.');

    const secondClaim = await queueRepository.claim('e2e-worker-b', claimTimeB, 10);
    expect(secondClaim).toHaveLength(1);
    const [jobB] = secondClaim;
    if (jobB === undefined) throw new Error('expected the second scenario job to be claimed');
    expect(jobB.payload.projectId).toBe(projectIdB);
    expect(jobB.executionAttempt).toBe(1);
    expect(jobB.deliveryCount).toBe(2);

    const collectorKey = collectorIdempotencyKey(jobB.jobId, 1);
    const committed = await collect({
      jobId: jobB.jobId,
      type: 'collect.source',
      version: 1,
      idempotencyKey: collectorKey,
      correlationId: ids.generate(),
      occurredAt: claimTimeB.toISOString(),
      payload: { projectId: projectIdB, sourceId: sourceIdB },
    });
    expect(committed.outcome).toBe('stored_new_content');
    const httpCountAfterCrash = httpCalls.length;
    expect(httpCountAfterCrash).toBe(2);

    const recovered = await queueRepository.claim('e2e-worker-c', recoveryTime, 10);
    expect(recovered).toHaveLength(1);
    const [redelivered] = recovered;
    if (redelivered === undefined) throw new Error('expected the redelivered job to be claimed');
    expect(redelivered.jobId).toBe(jobB.jobId);
    expect(redelivered.executionAttempt).toBe(1);
    expect(redelivered.deliveryCount).toBe(3);
    expect(redelivered.leaseEpoch).toBe(jobB.leaseEpoch + 2);
    expect(redelivered.leaseOwner).toBe('e2e-worker-c');

    processClockNow = processTimeB;
    await processor.process(redelivered, new AbortController().signal);

    expect(httpCalls.length).toBe(httpCountAfterCrash);

    const attemptRows = await owner<readonly { idempotency_key: string }[]>`
      select idempotency_key
      from public.collection_attempts
      where project_id = ${projectIdB}::uuid
    `;
    expect(attemptRows).toHaveLength(1);
    const [replayAttemptRow] = attemptRows;
    if (replayAttemptRow === undefined) throw new Error('expected one replayed attempt row');
    expect(replayAttemptRow.idempotency_key).toBe(collectorKey);

    const completedRows = await owner<readonly { state: string }[]>`
      select state from public.durable_jobs where id = ${jobB.jobId}::uuid
    `;
    expect(completedRows).toHaveLength(1);
    const [replayCompletedRow] = completedRows;
    if (replayCompletedRow === undefined) throw new Error('expected the replayed job row');
    expect(replayCompletedRow.state).toBe('succeeded');

    const eventTypes = await owner<readonly { event_type: string }[]>`
      select event_type
      from public.durable_job_events
      where job_id = ${jobB.jobId}::uuid
      order by occurred_at, id
    `;
    // Events sharing occurred_at are ordered by random uuid, so assert the
    // multiset semantics rather than a strict sequence.
    expect(eventTypes).toHaveLength(7);
    expect(eventTypes.map((row) => row.event_type)).toEqual(expect.arrayContaining([
      'enqueued',
      'claimed',
      'claimed',
      'claimed',
      'lease_expired',
      'lease_expired',
      'succeeded',
    ]));
  });
});

async function insertReviewer(sql: postgres.Sql): Promise<void> {
  await sql`
    insert into auth.users (
      id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      ${reviewerId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', 'automatic-collection-e2e@example.invalid',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      ${scanTime.toISOString()}::timestamptz, ${scanTime.toISOString()}::timestamptz
    )
  `;
}

async function insertOfficialRelationship(
  sql: postgres.Sql,
  projectId: string,
  sourceId: string,
  slug: string,
): Promise<void> {
  await sql`
    insert into public.projects (id, slug, name, lifecycle)
    values (${projectId}::uuid, ${slug}, ${slug}, 'active')
  `;
  await sql`
    insert into public.sources (id, source_type, name, canonical_url, status)
    values (${sourceId}::uuid, 'official_web', ${slug}, ${`https://${slug}.example/`}, 'active')
  `;
  await sql`
    insert into public.project_sources (
      project_id, source_id, authority_domains, is_official, verified_at, verified_by
    ) values (
      ${projectId}::uuid, ${sourceId}::uuid, array[${`${slug}.example`}], true,
      ${scanTime.toISOString()}::timestamptz, ${reviewerId}::uuid
    )
  `;
}

async function dropWorkerRoles(sql: postgres.Sql): Promise<void> {
  await sql`drop role if exists automatic_collection_e2e_queue`;
  await sql`drop role if exists automatic_collection_e2e_collector`;
}

async function cleanSeedQueueLeftovers(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (transaction) => {
    await transaction`set local session_replication_role = replica`;
    await transaction`
      delete from public.durable_job_events
      where job_id in (
        select id from public.durable_jobs
        where project_id::text like '90000000-%'
      )
    `;
    await transaction`delete from public.durable_jobs where project_id::text like '90000000-%'`;
    await transaction`
      delete from public.source_schedule_events
      where schedule_id in (
        select id from public.source_collection_schedules
        where project_id::text like '90000000-%'
      )
    `;
    await transaction`
      delete from public.source_schedule_commands
      where schedule_id in (
        select id from public.source_collection_schedules
        where project_id::text like '90000000-%'
      )
    `;
    await transaction`
      delete from public.source_collection_schedules
      where project_id::text like '90000000-%'
    `;
  });
}

async function removeFixtures(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (transaction) => {
    await transaction`set local session_replication_role = replica`;
    await transaction`
      delete from public.durable_job_events
      where job_id in (
        select id from public.durable_jobs
        where project_id in (${projectIdA}::uuid, ${projectIdB}::uuid)
      )
    `;
    await transaction`
      delete from public.durable_jobs
      where project_id in (${projectIdA}::uuid, ${projectIdB}::uuid)
    `;
    await transaction`
      delete from public.source_schedule_events
      where schedule_id in (
        select id from public.source_collection_schedules
        where project_id in (${projectIdA}::uuid, ${projectIdB}::uuid)
      )
    `;
    await transaction`
      delete from public.source_schedule_commands
      where schedule_id in (
        select id from public.source_collection_schedules
        where project_id in (${projectIdA}::uuid, ${projectIdB}::uuid)
      )
    `;
    await transaction`
      delete from public.source_collection_schedules
      where project_id in (${projectIdA}::uuid, ${projectIdB}::uuid)
    `;
    await transaction`
      delete from public.discovered_items
      where project_id in (${projectIdA}::uuid, ${projectIdB}::uuid)
    `;
    await transaction`
      delete from public.collection_attempts
      where project_id in (${projectIdA}::uuid, ${projectIdB}::uuid)
    `;
    await transaction`
      delete from public.raw_items
      where project_id in (${projectIdA}::uuid, ${projectIdB}::uuid)
    `;
    await transaction`
      delete from public.project_sources
      where project_id in (${projectIdA}::uuid, ${projectIdB}::uuid)
    `;
    await transaction`delete from public.sources where id in (${sourceIdA}::uuid, ${sourceIdB}::uuid)`;
    await transaction`delete from public.projects where id in (${projectIdA}::uuid, ${projectIdB}::uuid)`;
    await transaction`
      delete from public.user_roles
      where user_id = ${reviewerId}::uuid or granted_by = ${reviewerId}::uuid
    `;
    await transaction`delete from public.profiles where id = ${reviewerId}::uuid`;
    await transaction`delete from auth.users where id = ${reviewerId}::uuid`;
  });
}
