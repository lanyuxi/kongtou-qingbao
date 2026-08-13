import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { SourceScheduleCommand } from '@airdrop/contracts';

import {
  createScheduleCommandRepository,
  type ExecuteScheduleCommandInput,
} from '../queue/schedule-command-repository.js';

const projectId = '83000000-0000-4000-8000-000000000010';
const sourceId = '83000000-0000-4000-8000-000000000020';
const adminId = '83000000-0000-4000-8000-000000000090';
const baseTime = '2026-08-14T00:00:00.000Z';

const integrationDatabaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
const adminDatabaseUrl = process.env.AIRDROP_QUEUE_ADMIN_DATABASE_TEST_URL;
const describeIntegration = integrationDatabaseUrl === undefined || adminDatabaseUrl === undefined
  ? describe.skip
  : describe;

describeIntegration('ScheduleCommandRepository PostgreSQL integration', () => {
  const owner = integrationDatabaseUrl === undefined ? null : postgres(integrationDatabaseUrl, { max: 1 });
  const repository = adminDatabaseUrl === undefined ? null : createScheduleCommandRepository(adminDatabaseUrl);
  let scheduleId = '';

  beforeAll(async () => {
    const database = requireOwner(owner);
    await removeFixtures(database);
  });

  beforeEach(async () => {
    const database = requireOwner(owner);
    await removeFixtures(database);
    await database`
      insert into auth.users (
        id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        ${adminId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'schedule-command@example.invalid',
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        ${baseTime}::timestamptz, ${baseTime}::timestamptz
      )
    `;
    await database`insert into public.user_roles (user_id, role, granted_at) values (${adminId}::uuid, 'admin', ${baseTime}::timestamptz)`;
    await database`insert into public.projects (id, slug, name, lifecycle) values (${projectId}::uuid, 'schedule-command-repository', 'Schedule Command Repository', 'active')`;
    await database`insert into public.sources (id, source_type, name, canonical_url, status) values (${sourceId}::uuid, 'official_web', 'Schedule Command', 'https://schedule-command.example/', 'active')`;
    await database`
      insert into public.project_sources (
        project_id, source_id, authority_domains, is_official, verified_at, verified_by
      ) values (
        ${projectId}::uuid, ${sourceId}::uuid, array['schedule-command.example'], true,
        ${baseTime}::timestamptz, ${adminId}::uuid
      )
    `;
    const schedules = await database`
      insert into public.source_collection_schedules (
        project_id, source_id, next_run_at, created_at, updated_at
      ) values (${projectId}::uuid, ${sourceId}::uuid, ${baseTime}::timestamptz, ${baseTime}::timestamptz, ${baseTime}::timestamptz)
      returning id
    `;
    scheduleId = schedules[0]?.id ?? '';
  });

  afterAll(async () => {
    if (repository !== null) await repository.close();
    if (owner !== null) {
      try {
        await removeFixtures(owner);
      } finally {
        await owner.end({ timeout: 5 });
      }
    }
  });

  it('executes pause, replays it, resumes, changes interval, and enqueues collect-now through the protected role', async () => {
    const commands = requireRepository(repository);
    const paused = await commands.execute(command(scheduleId, pauseCommand(1), 'pause-1'));
    const replayed = await commands.execute(command(scheduleId, pauseCommand(1), 'pause-1'));
    const resumed = await commands.execute(command(scheduleId, resumeCommand(2), 'resume-1'));
    const interval = await commands.execute(command(scheduleId, intervalCommand(3), 'interval-1'));

    expect(paused).toMatchObject({ command: 'pause', scheduleVersion: 2, enabled: false, replayed: false });
    expect(replayed).toMatchObject({ command: 'pause', scheduleVersion: 2, enabled: false, replayed: true });
    expect(resumed).toMatchObject({ command: 'resume', scheduleVersion: 3, enabled: true, replayed: false });
    expect(interval).toMatchObject({ command: 'change_interval', scheduleVersion: 4, intervalSeconds: 300 });
    const collected = await commands.execute(command(scheduleId, collectNowCommand(4), 'collect-now-1'));
    expect(collected).toMatchObject({ command: 'collect_now', scheduleVersion: 5, jobId: expect.any(String) });
    expect(collected.nextRunAt).toBe(interval.nextRunAt);
  });

  it('maps a stale expected version to the stable conflict code', async () => {
    await expect(requireRepository(repository).execute(command(scheduleId, pauseCommand(0), 'stale-1')))
      .rejects.toMatchObject({ code: 'schedule_version_conflict' });
  });

});

function command(
  scheduleId: string,
  command: SourceScheduleCommand,
  idempotencyKey: string,
): ExecuteScheduleCommandInput {
  return {
    actorId: adminId,
    scheduleId,
    idempotencyKey,
    command,
  };
}

function pauseCommand(expectedVersion: number): SourceScheduleCommand {
  return { version: 1, command: 'pause', expectedVersion, intervalSeconds: null };
}

function resumeCommand(expectedVersion: number): SourceScheduleCommand {
  return { version: 1, command: 'resume', expectedVersion, intervalSeconds: null };
}

function intervalCommand(expectedVersion: number): SourceScheduleCommand {
  return { version: 1, command: 'change_interval', expectedVersion, intervalSeconds: 300 };
}

function collectNowCommand(expectedVersion: number): SourceScheduleCommand {
  return { version: 1, command: 'collect_now', expectedVersion, intervalSeconds: null };
}

function requireRepository(value: ReturnType<typeof createScheduleCommandRepository> | null) {
  if (value === null) throw new Error('Database integration environment is unavailable.');
  return value;
}

function requireOwner(value: postgres.Sql | null): postgres.Sql {
  if (value === null) throw new Error('Database integration environment is unavailable.');
  return value;
}

async function removeFixtures(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (transaction) => {
    await transaction`set local session_replication_role = replica`;
    await transaction`delete from public.durable_job_events where job_id in (select id from public.durable_jobs where project_id = ${projectId}::uuid)`;
    await transaction`delete from public.durable_jobs where project_id = ${projectId}::uuid`;
    await transaction`delete from public.source_schedule_events where schedule_id in (select id from public.source_collection_schedules where project_id = ${projectId}::uuid)`;
    await transaction`delete from public.source_schedule_commands where schedule_id in (select id from public.source_collection_schedules where project_id = ${projectId}::uuid)`;
    await transaction`delete from public.source_collection_schedules where project_id = ${projectId}::uuid`;
    await transaction`delete from public.project_sources where project_id = ${projectId}::uuid`;
    await transaction`delete from public.sources where id = ${sourceId}::uuid`;
    await transaction`delete from public.projects where id = ${projectId}::uuid`;
    await transaction`delete from public.user_roles where user_id = ${adminId}::uuid`;
    await transaction`delete from public.profiles where id = ${adminId}::uuid`;
    await transaction`delete from auth.users where id = ${adminId}::uuid`;
  });
}
