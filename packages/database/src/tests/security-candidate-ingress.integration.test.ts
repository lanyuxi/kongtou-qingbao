import { randomUUID } from 'node:crypto';

import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ExtractionCandidatePayload } from '@airdrop/contracts';
import {
  createExtractionRepository,
  ExtractionPersistenceError,
  type ExtractionCandidateInput,
} from '../ai/extraction-repository.js';

const namespace = '94000000-0000-4000-8000-';
const projectId = `${namespace}000000000010`;
const sourceId = `${namespace}000000000020`;
const rawItemId = `${namespace}000000000030`;
const discoveredItemId = `${namespace}000000000040`;
const aiRunId = `${namespace}000000000050`;
const integrationDatabaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
const describeIntegration = integrationDatabaseUrl === undefined ? describe.skip : describe;
const disposableMarker = {
  id: '90000000-0000-4000-8000-000000000019',
  slug: 'disposable-integration-database-marker',
  name: 'Disposable Integration Database Marker',
  lifecycle: 'paused',
} as const;

describeIntegration('security extraction candidate ingress integration', () => {
  const owner = integrationDatabaseUrl === undefined
    ? null
    : postgres(integrationDatabaseUrl, { max: 2, onnotice: () => {} });
  let worker: postgres.Sql | null = null;
  let workerRole = '';

  beforeAll(async () => {
    const database = requireSql(owner);
    await assertDisposableDatabase(database);
    await removeFixtures(database);
    workerRole = `security_ingress_test_${randomUUID().replaceAll('-', '')}`;
    const password = `security-ingress-${randomUUID()}`;
    const statements = await database`
      select
        pg_catalog.format(
          'create role %I login inherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication password %L',
          ${workerRole}::text,
          ${password}::text
        ) as create_statement,
        pg_catalog.format('grant ai_stage_worker to %I', ${workerRole}::text) as grant_statement
    `;
    await database.unsafe(requireStatement(statements[0]?.create_statement));
    await database.unsafe(requireStatement(statements[0]?.grant_statement));
    const loginUrl = new URL(requireDatabaseUrl(integrationDatabaseUrl));
    loginUrl.username = workerRole;
    loginUrl.password = password;
    worker = postgres(loginUrl.toString(), { max: 1, onnotice: () => {} });
  });

  beforeEach(async () => {
    const database = requireSql(owner);
    await dropFailureTrigger(database);
    await removeFixtures(database);
    await seedFixtures(database);
  });

  afterAll(async () => {
    if (worker !== null) await worker.end({ timeout: 5 });
    if (owner !== null) {
      try {
        await dropFailureTrigger(owner);
        await removeFixtures(owner);
        if (workerRole !== '') await dropDisposableRole(owner, workerRole);
      } finally {
        await owner.end({ timeout: 5 });
      }
    }
  });

  it('atomically routes both security claims, keeps ordinary pending isolated, and replays once', async () => {
    const repository = createExtractionRepository(requireSql(worker));
    const batch = [
      candidate('points_program', 'a'),
      candidate('security_risk', 'b'),
      candidate('scam_indicator', 'c'),
    ] as const;

    await expect(repository.insertCandidates(aiRunId, batch)).resolves.toBe(3);
    await expect(repository.listPendingCandidates(25)).resolves.toMatchObject([
      { payload: { claimType: 'points_program' } },
    ]);
    await expect(repository.insertCandidates(aiRunId, batch)).resolves.toBe(0);

    const snapshot = await ingressSnapshot(requireSql(owner));
    expect(snapshot).toEqual({
      extraction_count: 3,
      security_candidate_count: 2,
      security_event_count: 2,
      outbox_count: 2,
    });
  });

  it('rolls back ordinary and security candidate inserts when routing fails', async () => {
    const database = requireSql(owner);
    await installFailureTrigger(database);
    const repository = createExtractionRepository(requireSql(worker));

    await expect(repository.insertCandidates(aiRunId, [
      candidate('task_launch', 'd'),
      candidate('security_risk', 'e'),
    ])).rejects.toEqual(new ExtractionPersistenceError());

    const rows = await database`
      select count(*)::integer as count
      from public.extraction_candidates
      where project_id = ${projectId}::uuid
    `;
    expect(rows[0]?.count).toBe(0);
    await expect(ingressSnapshot(database)).resolves.toEqual({
      extraction_count: 0,
      security_candidate_count: 0,
      security_event_count: 0,
      outbox_count: 0,
    });
  });
});

function candidate(
  claimType: ExtractionCandidatePayload['claimType'],
  hashCharacter: string,
): ExtractionCandidateInput {
  return {
    projectId,
    sourceId,
    discoveredItemId,
    rawItemId,
    payload: {
      claimType,
      signalType: claimType,
      title: `Integration ${claimType}`,
      summary: `Grounded integration summary for ${claimType}.`,
      confidence: 80,
      evidenceQuote: `Grounded integration evidence for ${claimType}.`,
      occurredAtIso: null,
    },
    payloadSha256: hashCharacter.repeat(64),
  };
}

async function seedFixtures(sql: postgres.Sql): Promise<void> {
  await sql`
    insert into public.projects (id, slug, name, lifecycle)
    values (${projectId}::uuid, 'security-ingress-integration', 'Security Ingress Integration', 'active')
  `;
  await sql`
    insert into public.sources (id, source_type, name, canonical_url, status)
    values (${sourceId}::uuid, 'official_web', 'Security Ingress Source',
      'https://security-ingress.example/', 'active')
  `;
  await sql`
    insert into public.raw_items (
      id, project_id, source_id, logical_url, final_url, content_kind,
      media_type, raw_text, sha256, collected_at, created_at
    ) values (
      ${rawItemId}::uuid, ${projectId}::uuid, ${sourceId}::uuid,
      'https://security-ingress.example/feed', 'https://security-ingress.example/feed',
      'rss_feed', 'application/json', 'Grounded security ingress integration evidence.',
      repeat('9', 64), now(), now()
    )
  `;
  await sql`
    insert into public.discovered_items (
      id, project_id, source_id, feed_raw_item_id, stable_entry_key, version,
      title, summary, is_authority_domain, disposition, created_at
    ) values (
      ${discoveredItemId}::uuid, ${projectId}::uuid, ${sourceId}::uuid,
      ${rawItemId}::uuid, 'security-ingress-entry', 1,
      'Security ingress entry', 'Grounded security ingress integration evidence.',
      true, 'eligible', now()
    )
  `;
  await sql`
    insert into public.ai_runs (
      id, stage, input_kind, input_id, input_hash, model_id,
      prompt_version, schema_version, pipeline_version, status, output, created_at
    ) values (
      ${aiRunId}::uuid, 'extract.v1', 'discovered_item', ${discoveredItemId}::uuid,
      repeat('8', 64), 'integration-model', 'extract-prompt-v1',
      'extract-schema-v1', 'extract-pipeline-v1', 'succeeded', '{}'::jsonb, now()
    )
  `;
}

async function ingressSnapshot(sql: postgres.Sql) {
  const rows = await sql`
    select
      (select count(*)::integer from public.extraction_candidates
       where project_id = ${projectId}::uuid) as extraction_count,
      (select count(*)::integer from public.security_indicator_candidates
       where project_id = ${projectId}::uuid) as security_candidate_count,
      (select count(*)::integer from public.security_events
       where candidate_id in (
         select id from public.security_indicator_candidates where project_id = ${projectId}::uuid
       )) as security_event_count,
      (select count(*)::integer from public.outbox_events
       where aggregate_id in (
         select id from public.security_indicator_candidates where project_id = ${projectId}::uuid
       )) as outbox_count
  `;
  return rows[0];
}

async function installFailureTrigger(sql: postgres.Sql): Promise<void> {
  await assertDisposableDatabase(sql);
  await sql`
    create function public.reject_security_ingress_test_event()
    returns trigger language plpgsql as $$
    begin
      raise exception 'forced_security_ingress_failure';
    end;
    $$
  `;
  await sql`
    create trigger reject_security_ingress_test_event
    before insert on public.security_events
    for each row execute function public.reject_security_ingress_test_event()
  `;
}

async function dropFailureTrigger(sql: postgres.Sql): Promise<void> {
  await assertDisposableDatabase(sql);
  await sql`drop trigger if exists reject_security_ingress_test_event on public.security_events`;
  await sql`drop function if exists public.reject_security_ingress_test_event()`;
}

async function removeFixtures(sql: postgres.Sql): Promise<void> {
  await assertDisposableDatabase(sql);
  await sql.begin(async (transaction) => {
    await assertDisposableDatabase(transaction);
    await transaction`set local session_replication_role = replica`;
    const securityRows = await transaction`
      select id from public.security_indicator_candidates where project_id = ${projectId}::uuid
    `;
    const securityIds = securityRows.map((row) => row.id as string);
    if (securityIds.length > 0) {
      await transaction`delete from public.outbox_events where aggregate_id = any(${securityIds}::uuid[])`;
      await transaction`delete from public.security_events where aggregate_id = any(${securityIds}::uuid[])`;
      await transaction`delete from public.security_indicator_candidates where id = any(${securityIds}::uuid[])`;
    }
    await transaction`delete from public.extraction_candidates where project_id = ${projectId}::uuid`;
    await transaction`delete from public.ai_runs where id = ${aiRunId}::uuid`;
    await transaction`delete from public.discovered_items where id = ${discoveredItemId}::uuid`;
    await transaction`delete from public.raw_items where id = ${rawItemId}::uuid`;
    await transaction`delete from public.sources where id = ${sourceId}::uuid`;
    await transaction`delete from public.projects where id = ${projectId}::uuid`;
  });
}

async function assertDisposableDatabase(sql: postgres.Sql | TransactionSql): Promise<void> {
  const rows = await sql`
    select id, slug, name, lifecycle from public.projects
    where id = ${disposableMarker.id}::uuid
  `;
  if (JSON.stringify(rows[0]) !== JSON.stringify(disposableMarker)) {
    throw new Error('disposable_database_marker_missing');
  }
}

async function dropDisposableRole(sql: postgres.Sql, roleName: string): Promise<void> {
  await assertDisposableDatabase(sql);
  if (!/^security_ingress_test_[0-9a-f]{32}$/.test(roleName)) {
    throw new Error('invalid_disposable_role_name');
  }
  const statements = await sql`
    select
      pg_catalog.format('revoke ai_stage_worker from %I', ${roleName}::text) as revoke_statement,
      pg_catalog.format('drop role if exists %I', ${roleName}::text) as drop_statement
  `;
  await sql.unsafe(requireStatement(statements[0]?.revoke_statement));
  await sql.unsafe(requireStatement(statements[0]?.drop_statement));
}

function requireSql(value: postgres.Sql | null): postgres.Sql {
  if (value === null) throw new Error('security ingress integration environment unavailable');
  return value;
}

function requireDatabaseUrl(value: string | undefined): string {
  if (value === undefined) throw new Error('integration database URL unavailable');
  return value;
}

function requireStatement(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('statement generation failed');
  return value;
}
