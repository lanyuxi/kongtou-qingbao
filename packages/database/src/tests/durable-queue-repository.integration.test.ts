import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createDurableCollectionQueueRepository,
  LeaseFenceError,
} from '../queue/durable-queue-repository.js';
import type { ClaimedCollectionJob } from '@airdrop/contracts';

const projectId = '82000000-0000-4000-8000-000000000010';
const sourceId = '82000000-0000-4000-8000-000000000020';
const reviewerId = '82000000-0000-4000-8000-000000000090';
const seedSourceId = '90000000-0000-4000-8000-000000000020';
const workerRole = 'durable_queue_repository_test_worker';
const workerPassword = 'durable-queue-repository-test-only';
const baseTime = new Date('2026-08-14T00:00:00.000Z');
const dueTime = new Date('2026-08-14T00:10:00.000Z');

const integrationDatabaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
const describeIntegration = integrationDatabaseUrl === undefined ? describe.skip : describe;

describeIntegration('DurableCollectionQueueRepository PostgreSQL integration', () => {
  let seedSourceStatus: string | null = null;
  const owner = integrationDatabaseUrl === undefined
    ? null
    : postgres(integrationDatabaseUrl, { max: 1 });
  const workerDatabaseUrl = integrationDatabaseUrl === undefined
    ? null
    : withDatabaseCredentials(integrationDatabaseUrl, workerRole, workerPassword);
  const first = workerDatabaseUrl === null
    ? null
    : createDurableCollectionQueueRepository(workerDatabaseUrl);
  const second = workerDatabaseUrl === null
    ? null
    : createDurableCollectionQueueRepository(workerDatabaseUrl);

  beforeAll(async () => {
    if (owner === null) throw new Error('Database integration environment is unavailable.');
    await removeFixtures(owner);
    await dropWorkerRole(owner);
    const seedRows = await owner<readonly { status: string }[]>`
      select status::text
      from public.sources
      where id = ${seedSourceId}::uuid
    `;
    seedSourceStatus = seedRows[0]?.status ?? null;
    if (seedSourceStatus !== null) {
      await owner`
        update public.sources
        set status = 'suspended'
        where id = ${seedSourceId}::uuid
      `;
    }
    await owner`
      create role durable_queue_repository_test_worker
      login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication
      password 'durable-queue-repository-test-only'
    `;
    await owner`
      grant collection_queue_worker to durable_queue_repository_test_worker
      with admin false, inherit false, set true
    `;
  });

  beforeEach(async () => {
    if (owner === null) throw new Error('Database integration environment is unavailable.');
    await removeFixtures(owner);
    await owner`
      insert into auth.users (
        id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        ${reviewerId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'repository-queue@example.invalid',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        ${baseTime.toISOString()}::timestamptz, ${baseTime.toISOString()}::timestamptz
      )
    `;
    await owner`
      insert into public.projects (id, slug, name, lifecycle)
      values (${projectId}::uuid, 'repository-queue', 'Repository Queue', 'active')
    `;
    await owner`
      insert into public.sources (id, source_type, name, canonical_url, status)
      values (${sourceId}::uuid, 'official_web', 'Repository Queue',
        'https://repository-queue.example/', 'active')
    `;
    await owner`
      insert into public.project_sources (
        project_id, source_id, authority_domains, is_official, verified_at, verified_by
      ) values (
        ${projectId}::uuid, ${sourceId}::uuid, array['repository-queue.example'], true,
        ${baseTime.toISOString()}::timestamptz, ${reviewerId}::uuid
      )
    `;
  });

  afterAll(async () => {
    if (owner === null || first === null || second === null) return;
    try {
      await removeFixtures(owner);
    } finally {
      try {
        if (seedSourceStatus !== null) {
          await owner`
            update public.sources
            set status = ${seedSourceStatus}::public.source_status
            where id = ${seedSourceId}::uuid
          `;
        }
      } finally {
        await Promise.all([first.close(), second.close()]);
        try {
          await dropWorkerRole(owner);
        } finally {
          await owner.end({ timeout: 5 });
        }
      }
    }
  });

  it('coalesces duplicate reconciliation into one schedule and job', async () => {
    const repository = requireRepository(first);

    await expect(repository.reconcile(baseTime, 100)).resolves.toEqual({
      createdScheduleCount: 1,
      enqueuedCount: 1,
      canceledCount: 0,
      lockAcquired: true,
    });
    await expect(repository.reconcile(baseTime, 100)).resolves.toEqual({
      createdScheduleCount: 0,
      enqueuedCount: 0,
      canceledCount: 0,
      lockAcquired: true,
    });

    const rows = await requireOwner(owner)`
      select
        (select count(*)::integer from public.source_collection_schedules
          where project_id = ${projectId}::uuid) as schedules,
        (select count(*)::integer from public.durable_jobs
          where project_id = ${projectId}::uuid) as jobs,
        (select count(*)::integer from public.durable_job_events as event
          join public.durable_jobs as job on job.id = event.job_id
          where job.project_id = ${projectId}::uuid and event.event_type = 'enqueued') as events
    `;
    expect(rows[0]).toEqual({ schedules: 1, jobs: 1, events: 1 });
  });

  it('allows only one of two independent consumers to claim the same job', async () => {
    await enqueue(first);

    const [firstClaims, secondClaims] = await Promise.all([
      requireRepository(first).claim('worker-one', dueTime, 1),
      requireRepository(second).claim('worker-two', dueTime, 1),
    ]);

    expect([...firstClaims, ...secondClaims]).toHaveLength(1);
    expect([firstClaims.length, secondClaims.length].sort()).toEqual([0, 1]);
  });

  it('recovers an expired lease without consuming another execution attempt', async () => {
    await enqueue(first);
    const original = await claimOne(first, 'worker-one', dueTime);
    const recoveredAt = new Date(dueTime.getTime() + 121_000);
    const recovered = await claimOne(second, 'worker-two', recoveredAt);

    expect(recovered.jobId).toBe(original.jobId);
    expect(recovered.executionAttempt).toBe(1);
    expect(recovered.deliveryCount).toBe(2);
    expect(recovered.leaseEpoch).toBeGreaterThan(original.leaseEpoch);
  });

  it('advances execution attempt only after an intentional retry', async () => {
    await enqueue(first);
    const original = await claimOne(first, 'worker-one', dueTime);
    const retryAt = new Date(dueTime.getTime() + 60_000);

    await requireRepository(first).retry(
      fenceOf(original),
      { resultCode: 'timeout', detail: 'temporary timeout' },
      retryAt,
      dueTime,
    );
    const retried = await claimOne(second, 'worker-two', retryAt);

    expect(retried.jobId).toBe(original.jobId);
    expect(retried.executionAttempt).toBe(2);
    expect(retried.deliveryCount).toBe(2);
  });

  it('rejects stale completion after a lease transfers', async () => {
    await enqueue(first);
    const stale = await claimOne(first, 'worker-one', dueTime);
    const recoveredAt = new Date(dueTime.getTime() + 121_000);
    const current = await claimOne(second, 'worker-two', recoveredAt);

    await expect(
      requireRepository(first).succeed(fenceOf(stale), 'stored_new_content', recoveredAt),
    ).rejects.toBeInstanceOf(LeaseFenceError);
    await expect(
      requireRepository(second).succeed(fenceOf(current), 'stored_new_content', recoveredAt),
    ).resolves.toBeUndefined();
  });

  it('maps the server-only queue health snapshot', async () => {
    const baseline = await requireRepository(first).health(dueTime);
    await enqueue(first);

    await expect(requireRepository(first).health(dueTime)).resolves.toMatchObject({
      queuedCount: baseline.queuedCount + 1,
      retryWaitCount: baseline.retryWaitCount,
      leasedCount: baseline.leasedCount,
      expiredLeaseCount: baseline.expiredLeaseCount,
      deadLetterCount: baseline.deadLetterCount,
    });
    expect((await requireRepository(first).health(dueTime)).oldestRunnableAgeSeconds)
      .toBeGreaterThanOrEqual(0);
    await expect(
      requireRepository(first).isEligible(projectId, sourceId),
    ).resolves.toBe(true);
  });

  it('maps a generic PL/pgSQL event failure to persistence and rolls back completion', async () => {
    const database = requireOwner(owner);
    await enqueue(first);
    const claimed = await claimOne(first, 'worker-one', dueTime);
    await database`
      create table public.queue_repository_rejected_jobs (
        job_id uuid primary key
      )
    `;
    await database`
      insert into public.queue_repository_rejected_jobs (job_id)
      values (${claimed.jobId}::uuid)
    `;
    await database`
      create function public.reject_repository_queue_success_event()
      returns trigger language plpgsql as $$
      begin
        if new.event_type = 'succeeded' and exists (
          select 1 from public.queue_repository_rejected_jobs as rejected
          where rejected.job_id = new.job_id
        ) then
          raise exception 'integration_forced_invalid_event_transition' using errcode = 'P0001';
        end if;
        return new;
      end;
      $$
    `;
    await database`
      create trigger reject_repository_queue_success_event
      before insert on public.durable_job_events
      for each row execute function public.reject_repository_queue_success_event()
    `;

    try {
      await expect(
        requireRepository(first).succeed(fenceOf(claimed), 'stored_new_content', dueTime),
      ).rejects.toMatchObject({ code: 'queue_persistence_failed' });
      const rows = await database`
        select state::text, lease_owner, execution_attempt,
          (select count(*)::integer from public.durable_job_events
            where job_id = ${claimed.jobId}::uuid and event_type = 'succeeded') as success_events
        from public.durable_jobs where id = ${claimed.jobId}::uuid
      `;
      expect(rows[0]).toEqual({
        state: 'leased',
        lease_owner: 'worker-one',
        execution_attempt: 1,
        success_events: 0,
      });
    } finally {
      await database`drop trigger if exists reject_repository_queue_success_event on public.durable_job_events`;
      await database`drop function if exists public.reject_repository_queue_success_event()`;
      await database`drop table if exists public.queue_repository_rejected_jobs`;
    }
  });
});

type IntegrationRepository = ReturnType<typeof createDurableCollectionQueueRepository>;

async function enqueue(repository: IntegrationRepository | null): Promise<void> {
  await requireRepository(repository).reconcile(baseTime, 100);
}

async function claimOne(repository: IntegrationRepository | null, workerId: string, now: Date) {
  const claims = await requireRepository(repository).claim(workerId, now, 1);
  const claim = claims[0];
  if (claim === undefined) throw new Error('Expected one claimed collection job.');
  return claim;
}

function fenceOf(claimed: ClaimedCollectionJob) {
  return {
    jobId: claimed.jobId,
    workerId: claimed.leaseOwner,
    leaseEpoch: claimed.leaseEpoch,
  };
}

function requireRepository(repository: IntegrationRepository | null): IntegrationRepository {
  if (repository === null) throw new Error('Database integration environment is unavailable.');
  return repository;
}

function requireOwner(owner: postgres.Sql | null): postgres.Sql {
  if (owner === null) throw new Error('Database integration environment is unavailable.');
  return owner;
}

function withDatabaseCredentials(databaseUrl: string, username: string, password: string): string {
  const parsed = new URL(databaseUrl);
  parsed.username = username;
  parsed.password = password;
  return parsed.href;
}

async function dropWorkerRole(sql: postgres.Sql): Promise<void> {
  await sql`drop role if exists durable_queue_repository_test_worker`;
}

async function removeFixtures(sql: postgres.Sql): Promise<void> {
  await sql`drop trigger if exists reject_repository_queue_success_event on public.durable_job_events`;
  await sql`drop function if exists public.reject_repository_queue_success_event()`;
  await sql`drop table if exists public.queue_repository_rejected_jobs`;
  await sql.begin(async (transaction) => {
    await transaction`set local session_replication_role = replica`;
    await transaction`
      delete from public.durable_job_events
      where job_id in (select id from public.durable_jobs where project_id = ${projectId}::uuid)
    `;
    await transaction`delete from public.durable_jobs where project_id = ${projectId}::uuid`;
    await transaction`
      delete from public.source_schedule_events
      where schedule_id in (
        select id from public.source_collection_schedules where project_id = ${projectId}::uuid
      )
    `;
    await transaction`
      delete from public.source_schedule_commands
      where schedule_id in (
        select id from public.source_collection_schedules where project_id = ${projectId}::uuid
      )
    `;
    await transaction`delete from public.source_collection_schedules where project_id = ${projectId}::uuid`;
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
