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
    expect(client.fromCalls).toEqual(['project_current_score_factors']);
    expect(client.filters).toEqual([
      ['project_id', projectId],
      ['project_score_id', scoreId],
    ]);
  });

  it('selects only the exact safe factor projection', async () => {
    const client = createQueryRecorder({ factorRows: [] });

    await createProjectRepository(client).listCurrentScoreFactors(projectId, scoreId);

    expect(client.selections).toEqual([
      'project_id,project_score_id,axis,factor_code,contribution,input_value,detail',
    ]);
    expect(client.selections[0]).not.toMatch(
      /url|raw|candidate|review|hash|provider|audit|outbox|credential/i,
    );
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
    expect(client.fromCalls).toEqual(['project_current_score_evidence_citations']);
    expect(client.filters).toEqual([
      ['project_id', projectId],
      ['project_score_id', scoreId],
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

  it('returns all 1001 citations across exact-count ordered pages without losing the final conflict', async () => {
    const citationRows = createCitationRows(1_001);
    const client = createQueryRecorder({ citationRows });

    const citations = await createProjectRepository(client).listCurrentScoreEvidenceCitations(
      projectId,
      scoreId,
    );

    expect(citations).toHaveLength(1_001);
    expect(citations.at(-1)).toMatchObject({
      evidenceId: evidenceIdForIndex(1_000),
      citationText: '经审核但与前述内容冲突的最后一条 Evidence 引用。',
    });
    expect(client.fromCalls).toEqual([
      'project_current_score_evidence_citations',
      'project_current_score_evidence_citations',
    ]);
    expect(client.selections).toEqual([
      'project_id,project_score_id,signal_id,signal_title,signal_verification,signal_published_at,evidence_id,citation_text,evidence_source_field,evidence_verified_at,source_id,source_name,source_type,source_is_official,source_relation_verified_at',
      'project_id,project_score_id,signal_id,signal_title,signal_verification,signal_published_at,evidence_id,citation_text,evidence_source_field,evidence_verified_at,source_id,source_name,source_type,source_is_official,source_relation_verified_at',
    ]);
    expect(client.countRequests).toEqual(['exact', 'exact']);
    expect(client.filters).toEqual([
      ['project_id', projectId],
      ['project_score_id', scoreId],
      ['project_id', projectId],
      ['project_score_id', scoreId],
    ]);
    expect(client.orders).toEqual([
      ['signal_published_at', { ascending: false, nullsFirst: false }],
      ['signal_id', { ascending: true }],
      ['evidence_verified_at', { ascending: false }],
      ['evidence_id', { ascending: true }],
      ['signal_published_at', { ascending: false, nullsFirst: false }],
      ['signal_id', { ascending: true }],
      ['evidence_verified_at', { ascending: false }],
      ['evidence_id', { ascending: true }],
    ]);
    expect(client.ranges).toEqual([
      [0, 999],
      [1_000, 1_999],
    ]);
  });

  it.each([
    {
      name: 'a null exact count',
      rows: [citationRow],
      pages: [{ count: null }],
      code: 'citation_count_missing',
    },
    {
      name: 'a changed count on a later page',
      rows: createCitationRows(1_001),
      pages: [{}, { count: 1_002 }],
      code: 'citation_count_changed',
    },
    {
      name: 'a short page before the expected boundary',
      rows: createCitationRows(1_001),
      pages: [{ data: createCitationRows(999), count: 1_001 }],
      code: 'citation_page_size_mismatch',
    },
    {
      name: 'a duplicate row that replaces the final citation',
      rows: createCitationRows(1_001),
      pages: [{}, { data: [createCitationRows(1)[0]], count: 1_001 }],
      code: 'citation_duplicate_row',
    },
  ] as const)('fails safely on $name', async ({ rows, pages, code }) => {
    const client = createQueryRecorder({ citationRows: rows, citationPages: pages });

    await expect(
      createProjectRepository(client).listCurrentScoreEvidenceCitations(projectId, scoreId),
    ).rejects.toMatchObject({
      name: 'ProjectEvidenceCitationQueryError',
      code,
      message: 'Unable to read current project score Evidence citations.',
    });
  });

  it('sanitizes a PostgREST error from a later page', async () => {
    const client = createQueryRecorder({
      citationRows: createCitationRows(1_001),
      citationPages: [
        {},
        {
          error: {
            code: 'PGRST500',
            message: 'second page body contains private Evidence details',
            details: 'raw provider response',
            hint: 'review_note=secret',
          },
        },
      ],
    });

    const error = await createProjectRepository(client)
      .listCurrentScoreEvidenceCitations(projectId, scoreId)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ProjectEvidenceCitationQueryError);
    expect(error).toMatchObject({
      name: 'ProjectEvidenceCitationQueryError',
      code: 'PGRST500',
      message: 'Unable to read current project score Evidence citations.',
    });
    expect(String(error)).not.toMatch(/second page body|private Evidence|raw provider|review_note|secret/i);
  });

  it('selects only the exact safe citation projection', async () => {
    const client = createQueryRecorder({ citationRows: [] });

    await createProjectRepository(client).listCurrentScoreEvidenceCitations(projectId, scoreId);

    expect(client.selections).toEqual([
      'project_id,project_score_id,signal_id,signal_title,signal_verification,signal_published_at,evidence_id,citation_text,evidence_source_field,evidence_verified_at,source_id,source_name,source_type,source_is_official,source_relation_verified_at',
    ]);
    expect(client.selections[0]).not.toMatch(
      /url|raw|candidate|review|hash|provider|audit|outbox|credential/i,
    );
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
    expect(client.fromCalls).toEqual([]);
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

    expect(client.fromCalls).toEqual([
      'project_current_score_factors',
      'project_current_score_evidence_citations',
    ]);
    expect(client.filters).toEqual([
      ['project_id', projectId],
      ['project_score_id', scoreId],
      ['project_id', projectId],
      ['project_score_id', scoreId],
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
  readonly citationPages?: readonly CitationPageOverride[];
}

interface QueryRecorder {
  readonly fromCalls: string[];
  readonly selections: string[];
  readonly countRequests: (string | null)[];
  readonly filters: [string, string][];
  readonly orders: [string, { readonly ascending: boolean; readonly nullsFirst?: boolean }][];
  readonly ranges: [number, number][];
}

interface CitationPageOverride {
  readonly data?: readonly unknown[] | null;
  readonly count?: number | null;
  readonly error?: FakePostgrestError | null;
}

function createQueryRecorder(
  options: QueryRecorderOptions,
): SupabaseClient<Database> & QueryRecorder {
  const fromCalls: string[] = [];
  const selections: string[] = [];
  const countRequests: (string | null)[] = [];
  const filters: [string, string][] = [];
  const orders: [string, { readonly ascending: boolean; readonly nullsFirst?: boolean }][] = [];
  const ranges: [number, number][] = [];
  let citationRequestIndex = 0;

  const client = {
    fromCalls,
    selections,
    countRequests,
    filters,
    orders,
    ranges,
    from: (relation: string) => {
      fromCalls.push(relation);
      const isFactorQuery = relation === 'project_current_score_factors';
      let requestedCount: string | null = null;
      let requestedRange: [number, number] | null = null;
      const query = {
        select: (columns: string, selectOptions?: { readonly count?: string }) => {
          selections.push(columns);
          requestedCount = selectOptions?.count ?? null;
          countRequests.push(requestedCount);
          return query;
        },
        eq: (column: string, value: string) => {
          filters.push([column, value]);
          return query;
        },
        order: (
          column: string,
          orderOptions: { readonly ascending: boolean; readonly nullsFirst?: boolean },
        ) => {
          orders.push([column, orderOptions]);
          return query;
        },
        range: (from: number, to: number) => {
          requestedRange = [from, to];
          ranges.push(requestedRange);
          return query;
        },
        then: <TResult1 = {
          data: readonly unknown[] | null;
          error: FakePostgrestError | null;
          count: number | null;
        }>(
          onfulfilled?:
            | ((value: {
                data: readonly unknown[] | null;
                error: FakePostgrestError | null;
                count: number | null;
              }) => TResult1 | PromiseLike<TResult1>)
            | null,
        ) => {
          if (isFactorQuery) {
            return Promise.resolve({
              data: options.factorRows ?? null,
              error: options.factorError ?? null,
              count: null,
            }).then(onfulfilled);
          }

          const requestIndex = citationRequestIndex;
          citationRequestIndex += 1;
          const override = options.citationPages?.[requestIndex];
          const rows = options.citationRows ?? null;
          const [from, requestedTo] = requestedRange ?? [0, 999];
          const to = Math.min(requestedTo, from + 999);
          const defaultData = rows === null ? null : rows.slice(from, to + 1);
          return Promise.resolve({
            data: override !== undefined && 'data' in override ? override.data : defaultData,
            error:
              override !== undefined && 'error' in override
                ? (override.error ?? null)
                : (options.citationError ?? null),
            count:
              override !== undefined && 'count' in override
                ? (override.count ?? null)
                : requestedCount === 'exact'
                  ? (rows?.length ?? 0)
                  : null,
          }).then(onfulfilled);
        },
      };
      return query;
    },
  };

  return client as unknown as SupabaseClient<Database> & QueryRecorder;
}

function createCitationRows(count: number): readonly PublicProjectEvidenceCitationRow[] {
  return Array.from({ length: count }, (_, index) => ({
    ...citationRow,
    evidence_id: evidenceIdForIndex(index),
    citation_text:
      index === count - 1 && count > 1
        ? '经审核但与前述内容冲突的最后一条 Evidence 引用。'
        : `经审核的 Evidence 引用编号 ${index}，用于分页完整性测试。`,
  }));
}

function evidenceIdForIndex(index: number): string {
  return `30000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}
