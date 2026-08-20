import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createScoringRepository } from '../scoring/scoring-repository.js';

const projectId = '84000000-0000-4000-8000-000000000010';
const unevidencedOnlyProjectId = '84000000-0000-4000-8000-000000000011';
const sourceId = '84000000-0000-4000-8000-000000000020';
const rawItemId = '84000000-0000-4000-8000-000000000030';
const evidenceId = '84000000-0000-4000-8000-000000000070';
const evidencedSignalId = '84000000-0000-4000-8000-000000000080';
const unevidencedSignalId = '84000000-0000-4000-8000-000000000081';
const unevidencedOnlySignalId = '84000000-0000-4000-8000-000000000082';

const integrationDatabaseUrl = process.env.AIRDROP_DATABASE_TEST_URL;
const describeIntegration = integrationDatabaseUrl === undefined ? describe.skip : describe;

describeIntegration('ScoringRepository PostgreSQL integration', () => {
  const database =
    integrationDatabaseUrl === undefined ? null : postgres(integrationDatabaseUrl, { max: 1 });
  const repository = database === null ? null : createScoringRepository(database);

  beforeAll(async () => {
    if (database === null) {
      throw new Error('Database integration environment is unavailable.');
    }

    await database.unsafe('begin');
    await database`
      insert into public.projects (id, slug, name, lifecycle, created_at, updated_at)
      values
        (
          ${projectId}::uuid, 'scoring-evidence-gate', 'Scoring Evidence Gate', 'active',
          '2026-08-20T02:00:00.000Z', '2026-08-20T02:00:00.000Z'
        ),
        (
          ${unevidencedOnlyProjectId}::uuid, 'scoring-unevidenced-only',
          'Scoring Unevidenced Only', 'active',
          '2026-08-20T02:00:00.000Z', '2026-08-20T02:00:00.000Z'
        )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.sources (
        id, source_type, name, canonical_url, status, created_at, updated_at
      ) values (
        ${sourceId}::uuid, 'official_web', 'Scoring Evidence Source',
        'https://scoring-evidence.example/', 'active',
        '2026-08-20T02:00:00.000Z', '2026-08-20T02:00:00.000Z'
      )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.raw_items (
        id, project_id, source_id, logical_url, final_url, content_kind, media_type,
        raw_text, sha256, collected_at
      ) values (
        ${rawItemId}::uuid, ${projectId}::uuid, ${sourceId}::uuid,
        'https://scoring-evidence.example/article',
        'https://scoring-evidence.example/article',
        'feed_article_html', 'text/html',
        'A deterministic scoring Evidence fixture quote appears here.',
        ${'8'.repeat(64)}, '2026-08-20T02:01:00.000Z'
      )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.signals (
        id, project_id, signal_type, title, summary, verification, lifecycle,
        confidence, published_at, created_at
      ) values
        (
          ${evidencedSignalId}::uuid, ${projectId}::uuid, 'evidenced',
          'Evidenced scoring signal', 'This scoring input has valid Evidence.',
          'unverified', 'published', 80,
          '2026-08-20T02:02:00.000Z', '2026-08-20T02:02:00.000Z'
        ),
        (
          ${unevidencedSignalId}::uuid, ${projectId}::uuid, 'unevidenced',
          'Unevidenced scoring signal', 'This scoring input has no Evidence.',
          'unverified', 'published', 70,
          '2026-08-20T02:03:00.000Z', '2026-08-20T02:03:00.000Z'
        ),
        (
          ${unevidencedOnlySignalId}::uuid, ${unevidencedOnlyProjectId}::uuid,
          'unevidenced', 'Only unevidenced scoring signal',
          'This project has no Evidence-gated scoring input.',
          'unverified', 'published', 60,
          '2026-08-20T02:03:00.000Z', '2026-08-20T02:03:00.000Z'
        )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.evidence (
        id, source_id, raw_item_id, source_field, quote_text,
        normalized_quote_sha256, verified_at, created_at
      ) values (
        ${evidenceId}::uuid, ${sourceId}::uuid, ${rawItemId}::uuid,
        'article_raw_text', 'deterministic scoring Evidence fixture quote',
        public.evidence_quote_sha256_v1('deterministic scoring Evidence fixture quote'),
        '2026-08-20T02:04:00.000Z', '2026-08-20T02:04:00.000Z'
      )
      on conflict (id) do nothing
    `;
    await database`
      insert into public.signal_evidence_links (signal_id, evidence_id, created_at)
      values (
        ${evidencedSignalId}::uuid, ${evidenceId}::uuid,
        '2026-08-20T02:04:00.000Z'
      )
      on conflict (signal_id, evidence_id) do nothing
    `;
  });

  afterAll(async () => {
    if (database !== null) {
      try {
        // The single-connection transaction preserves append-only governance
        // history while keeping repeatable integration fixtures disposable.
        await database.unsafe('rollback');
      } finally {
        await database.end({ timeout: 5 });
      }
    }
  });

  it('returns only Evidence-gated published signals as scoring inputs', async () => {
    if (repository === null) {
      throw new Error('Database integration environment is unavailable.');
    }

    const inputs = await repository.listScoringInputs(1000);
    const fixture = inputs.find((input) => input.projectId === projectId);

    expect(fixture).toEqual({
      projectId,
      projectLifecycle: 'active',
      signals: [
        {
          signalId: evidencedSignalId,
          verification: 'unverified',
          confidence: 80,
          publishedAt: '2026-08-20T02:02:00.000Z',
          expiresAt: null,
          provenance: 'unknown',
        },
      ],
    });
    expect(fixture?.signals.map((signal) => signal.signalId)).not.toContain(unevidencedSignalId);
    expect(inputs.map((input) => input.projectId)).not.toContain(unevidencedOnlyProjectId);
  });
});
