import type { PublicProjectEvidenceCitationRow } from '@airdrop/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '../generated/database.types.js';
import {
  ProjectEvidenceCitationQueryError,
  ProjectScoreFactorQueryError,
} from '../repositories/project-score-evidence.js';
import { createProjectRepository } from '../repositories/project-repository.js';

const projectId = '30000000-0000-4000-8000-000000000001';
const scoreId = '30000000-0000-4000-8000-000000000002';

const factorRow = {
  project_id: projectId,
  project_score_id: scoreId,
  axis: 'opportunity',
  factor_code: 'signal_strength',
  contribution: 42.5,
  input_value: 0.8,
  detail: '加权信号强度 80.0%',
} as const;

const citationRow = {
  project_id: projectId,
  project_score_id: scoreId,
  signal_id: '30000000-0000-4000-8000-000000000010',
  signal_title: '积分计划延长',
  signal_verification: 'verified',
  signal_published_at: '2026-08-23T00:00:00.000Z',
  evidence_id: '30000000-0000-4000-8000-000000000020',
  citation_text: '官方公告明确说明积分计划将继续开放。',
  evidence_source_field: 'article_raw_text',
  evidence_verified_at: '2026-08-24T00:00:00.000Z',
  source_id: '30000000-0000-4000-8000-000000000030',
  source_name: '项目官方博客',
  source_type: 'official_web',
  source_is_official: true,
  source_relation_verified_at: '2026-08-22T00:00:00.000Z',
} as const;

describe('ProjectRepository.listCurrentScoreFactors', () => {
  it('strictly maps factors for the requested immutable score and sorts them deterministically', async () => {
    const client = createQueryRecorder({
      factorRows: [
        { ...factorRow, axis: 'risk', factor_code: 'hostile_signals', contribution: 20 },
        { ...factorRow, factor_code: 'signal_volume' },
        { ...factorRow, axis: 'confidence', factor_code: 'verification_mix', contribution: 9 },
        { ...factorRow, factor_code: 'signal_freshness' },
      ],
    });

    const factors = await createProjectRepository(client).listCurrentScoreFactors(projectId, scoreId);

    expect(factors).toEqual([
      {
        axis: 'opportunity',
        factorCode: 'signal_freshness',
        contribution: 42.5,
        inputValue: 0.8,
        detail: '加权信号强度 80.0%',
      },
      {
        axis: 'opportunity',
        factorCode: 'signal_volume',
        contribution: 42.5,
        inputValue: 0.8,
        detail: '加权信号强度 80.0%',
      },
      {
        axis: 'risk',
        factorCode: 'hostile_signals',
        contribution: 20,
        inputValue: 0.8,
        detail: '加权信号强度 80.0%',
      },
      {
        axis: 'confidence',
        factorCode: 'verification_mix',
        contribution: 9,
        inputValue: 0.8,
        detail: '加权信号强度 80.0%',
      },
    ]);
    expect(client.rpcCalls).toEqual([
      {
        name: 'list_public_score_factors',
        params: { p_project_id: projectId, p_project_score_id: scoreId },
      },
    ]);
  });

  it('selects only the exact safe factor projection', async () => {
    const client = createQueryRecorder({ factorRows: [] });

    await createProjectRepository(client).listCurrentScoreFactors(projectId, scoreId);

    expect(client.rpcCalls).toEqual([
      {
        name: 'list_public_score_factors',
        params: { p_project_id: projectId, p_project_score_id: scoreId },
      },
    ]);
  });

  it('rejects a row containing an extra unsafe field before mapping it', async () => {
    const client = createQueryRecorder({
      factorRows: [{ ...factorRow, url: 'https://unsafe.example.test' }],
    });

    await expect(
      createProjectRepository(client).listCurrentScoreFactors(projectId, scoreId),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('wraps PostgREST failures without exposing the response message or details', async () => {
    const client = createQueryRecorder({
      factorError: {
        code: '42501',
        message: 'response body contains private relation details',
        details: 'raw provider response',
        hint: 'review_note=secret',
      },
    });

    const error = await createProjectRepository(client)
      .listCurrentScoreFactors(projectId, scoreId)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ProjectScoreFactorQueryError);
    expect(error).toMatchObject({
      name: 'ProjectScoreFactorQueryError',
      code: '42501',
      message: 'Unable to read current project score factors.',
    });
    expect(String(error)).not.toMatch(/private relation|raw provider|review_note|secret/i);
  });
});

describe('ProjectRepository.listCurrentScoreEvidenceCitations', () => {
  it('strictly maps citations for the requested immutable score', async () => {
    const client = createQueryRecorder({ citationRows: [citationRow] });

    const citations = await createProjectRepository(client).listCurrentScoreEvidenceCitations(
      projectId,
      scoreId,
    );

    expect(citations).toEqual([
      {
        signalId: '30000000-0000-4000-8000-000000000010',
        signalTitle: '积分计划延长',
        signalVerification: 'verified',
        signalPublishedAt: '2026-08-23T00:00:00.000Z',
        evidenceId: '30000000-0000-4000-8000-000000000020',
        citationText: '官方公告明确说明积分计划将继续开放。',
        evidenceSourceField: 'article_raw_text',
        evidenceVerifiedAt: '2026-08-24T00:00:00.000Z',
        sourceId: '30000000-0000-4000-8000-000000000030',
        sourceName: '项目官方博客',
        sourceType: 'official_web',
        sourceIsOfficial: true,
        sourceRelationVerifiedAt: '2026-08-22T00:00:00.000Z',
      },
    ]);
    expect(client.rpcCalls).toEqual([
      {
        name: 'list_public_score_evidence_citations',
        params: { p_project_id: projectId, p_project_score_id: scoreId },
      },
    ]);
  });

  it('sorts by publication desc/null last, signal ID, verification desc, and Evidence ID', async () => {
    const client = createQueryRecorder({
      citationRows: [
        {
          ...citationRow,
          signal_id: '30000000-0000-4000-8000-000000000040',
          signal_published_at: null,
          evidence_id: '30000000-0000-4000-8000-000000000025',
        },
        {
          ...citationRow,
          signal_id: '30000000-0000-4000-8000-000000000010',
          evidence_id: '30000000-0000-4000-8000-000000000024',
          evidence_verified_at: '2026-08-22T00:00:00.000Z',
        },
        {
          ...citationRow,
          signal_id: '30000000-0000-4000-8000-000000000009',
          evidence_id: '30000000-0000-4000-8000-000000000023',
          evidence_verified_at: '2026-08-21T00:00:00.000Z',
        },
        {
          ...citationRow,
          signal_id: '30000000-0000-4000-8000-000000000009',
          evidence_id: '30000000-0000-4000-8000-000000000022',
        },
        {
          ...citationRow,
          signal_id: '30000000-0000-4000-8000-000000000009',
          evidence_id: '30000000-0000-4000-8000-000000000021',
        },
        {
          ...citationRow,
          signal_id: '30000000-0000-4000-8000-000000000030',
          signal_published_at: '2026-08-20T00:00:00.000Z',
          evidence_id: '30000000-0000-4000-8000-000000000026',
        },
      ],
    });

    const citations = await createProjectRepository(client).listCurrentScoreEvidenceCitations(
      projectId,
      scoreId,
    );

    expect(citations.map((citation) => citation.evidenceId)).toEqual([
      '30000000-0000-4000-8000-000000000021',
      '30000000-0000-4000-8000-000000000022',
      '30000000-0000-4000-8000-000000000023',
      '30000000-0000-4000-8000-000000000024',
      '30000000-0000-4000-8000-000000000026',
      '30000000-0000-4000-8000-000000000025',
    ]);
  });

  it('maps every citation from a single definer RPC call', async () => {
    const citationRows = createCitationRows(1_001);
    const client = createQueryRecorder({ citationRows });

    const citations = await createProjectRepository(client).listCurrentScoreEvidenceCitations(
      projectId,
      scoreId,
    );

    expect(citations).toHaveLength(1_001);
    expect(citations.at(-1)).toMatchObject({
      evidenceId: evidenceIdForIndex(1_000),
      citationText: citationRow.citation_text,
    });
    // One call instead of one count plus one page per 1_000 rows: the paging
    // loop was what made this section time out for anonymous readers.
    expect(client.rpcCalls).toHaveLength(1);
  });

  it('fails safely on a duplicate (signal, evidence) row', async () => {
    const rows = createCitationRows(2);
    const client = createQueryRecorder({ citationRows: [rows[0], rows[0]] });

    await expect(
      createProjectRepository(client).listCurrentScoreEvidenceCitations(projectId, scoreId),
    ).rejects.toMatchObject({
      name: 'ProjectEvidenceCitationQueryError',
      code: 'citation_duplicate_row',
      message: 'Unable to read current project score Evidence citations.',
    });
  });

  it('selects only the exact safe citation projection', async () => {
    const client = createQueryRecorder({ citationRows: [] });

    await createProjectRepository(client).listCurrentScoreEvidenceCitations(projectId, scoreId);

    expect(client.rpcCalls).toEqual([
      {
        name: 'list_public_score_evidence_citations',
        params: { p_project_id: projectId, p_project_score_id: scoreId },
      },
    ]);
  });

  it('rejects a row containing an extra unsafe field before mapping it', async () => {
    const client = createQueryRecorder({
      citationRows: [{ ...citationRow, raw_text: 'private source body' }],
    });

    await expect(
      createProjectRepository(client).listCurrentScoreEvidenceCitations(projectId, scoreId),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('wraps PostgREST failures without exposing the response message or details', async () => {
    const client = createQueryRecorder({
      citationError: {
        code: 'PGRST301',
        message: 'response body contains private evidence details',
        details: 'candidate_payload=secret',
        hint: 'provider_error=private',
      },
    });

    const error = await createProjectRepository(client)
      .listCurrentScoreEvidenceCitations(projectId, scoreId)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ProjectEvidenceCitationQueryError);
    expect(error).toMatchObject({
      name: 'ProjectEvidenceCitationQueryError',
      code: 'PGRST301',
      message: 'Unable to read current project score Evidence citations.',
    });
    expect(String(error)).not.toMatch(/private evidence|candidate_payload|provider_error|secret/i);
  });
});

describe('current score projection input validation and empty results', () => {
  it.each([
    ['factors', 'not-a-project-id', scoreId],
    ['factors', projectId, 'not-a-score-id'],
    ['citations', 'not-a-project-id', scoreId],
    ['citations', projectId, 'not-a-score-id'],
  ] as const)('rejects invalid %s identifiers before issuing a query', async (kind, project, score) => {
    const client = createQueryRecorder({ factorRows: [], citationRows: [] });
    const repository = createProjectRepository(client);

    const result =
      kind === 'factors'
        ? repository.listCurrentScoreFactors(project, score)
        : repository.listCurrentScoreEvidenceCitations(project, score);

    await expect(result).rejects.toThrow(RangeError);
    expect(client.rpcCalls).toEqual([]);
  });

  it('returns empty arrays when valid projections contain no rows', async () => {
    const client = createQueryRecorder({ factorRows: null, citationRows: null });
    const repository = createProjectRepository(client);

    await expect(repository.listCurrentScoreFactors(projectId, scoreId)).resolves.toEqual([]);
    await expect(repository.listCurrentScoreEvidenceCitations(projectId, scoreId)).resolves.toEqual(
      [],
    );
  });

  it('prevents a security-filtered immutable score from falling back to factor or Evidence base tables', async () => {
    const client = createQueryRecorder({ factorRows: [], citationRows: [] });
    const repository = createProjectRepository(client);

    await expect(repository.listCurrentScoreFactors(projectId, scoreId)).resolves.toEqual([]);
    await expect(repository.listCurrentScoreEvidenceCitations(projectId, scoreId)).resolves.toEqual([]);

    expect(client.rpcCalls).toEqual([
      {
        name: 'list_public_score_factors',
        params: { p_project_id: projectId, p_project_score_id: scoreId },
      },
      {
        name: 'list_public_score_evidence_citations',
        params: { p_project_id: projectId, p_project_score_id: scoreId },
      },
    ]);
  });
});

interface FakePostgrestError {
  readonly code: string;
  readonly message: string;
  readonly details: string;
  readonly hint: string;
}

interface QueryRecorderOptions {
  readonly factorRows?: readonly unknown[] | null;
  readonly citationRows?: readonly unknown[] | null;
  readonly factorError?: FakePostgrestError;
  readonly citationError?: FakePostgrestError;
}

interface RpcCall {
  readonly name: string;
  readonly params: Record<string, unknown>;
}

interface QueryRecorder {
  readonly rpcCalls: RpcCall[];
}

/**
 * The repository now reads both projections through a single definer RPC, so
 * the recorder only needs `rpc` — there is no select list, filter chain,
 * ordering, or paging to assert on any more. What still matters is *which*
 * function is called and with which identifiers, plus the error mapping.
 */
function createQueryRecorder(
  options: QueryRecorderOptions = {},
): SupabaseClient<Database> & QueryRecorder {
  const rpcCalls: RpcCall[] = [];

  const client = {
    rpcCalls,
    rpc: (name: string, params: Record<string, unknown>) => {
      rpcCalls.push({ name, params });
      const isFactorQuery = name === 'list_public_score_factors';
      const error = (isFactorQuery ? options.factorError : options.citationError) ?? null;
      const data = isFactorQuery
        ? (options.factorRows ?? null)
        : (options.citationRows ?? null);
      return Promise.resolve({
        data: error === null ? data : null,
        error,
      });
    },
  };

  return client as unknown as SupabaseClient<Database> & QueryRecorder;
}

function createCitationRows(count: number): readonly PublicProjectEvidenceCitationRow[] {
  return Array.from({ length: count }, (_unused, index) => ({
    ...citationRow,
    signal_id: signalIdForIndex(index),
    evidence_id: evidenceIdForIndex(index),
    signal_published_at: null,
  }));
}

function signalIdForIndex(index: number): string {
  const suffix = String(index + 1).padStart(12, '0');
  return `30000000-0000-4000-8100-${suffix}`;
}

function evidenceIdForIndex(index: number): string {
  const suffix = String(index + 1).padStart(12, '0');
  return `30000000-0000-4000-8200-${suffix}`;
}
