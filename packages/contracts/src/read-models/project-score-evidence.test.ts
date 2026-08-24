import { describe, expect, it } from 'vitest';

import {
  publicProjectEvidenceCitationRowSchema,
  publicProjectScoreFactorRowSchema,
  scoringAxisSchema,
} from '../index.js';

const projectId = 'b1000000-0000-4000-8000-000000000001';
const scoreId = 'b1000000-0000-4000-8000-000000000002';
const signalId = 'b1000000-0000-4000-8000-000000000003';
const evidenceId = 'b1000000-0000-4000-8000-000000000004';
const sourceId = 'b1000000-0000-4000-8000-000000000005';

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
  signal_id: signalId,
  signal_title: '积分计划延长',
  signal_verification: 'verified',
  signal_published_at: '2026-08-24T00:00:00.000Z',
  evidence_id: evidenceId,
  citation_text: '官方公告明确说明积分计划将继续开放。',
  evidence_source_field: 'article_raw_text',
  evidence_verified_at: '2026-08-24T01:00:00.000Z',
  source_id: sourceId,
  source_name: '项目官方博客',
  source_type: 'official_web',
  source_is_official: true,
  source_relation_verified_at: '2026-08-23T00:00:00.000Z',
} as const;

describe('public project score and evidence projections', () => {
  it('accepts the exact public factor and citation rows', () => {
    expect(publicProjectScoreFactorRowSchema.parse(factorRow)).toEqual(factorRow);
    expect(publicProjectEvidenceCitationRowSchema.parse(citationRow)).toEqual(citationRow);
  });

  it('rejects additional unsafe projection fields', () => {
    expect(publicProjectScoreFactorRowSchema.safeParse({ ...factorRow, url: 'https://unsafe.test' }).success).toBe(false);
    expect(publicProjectEvidenceCitationRowSchema.safeParse({ ...citationRow, raw_text: 'private' }).success).toBe(false);
  });

  it.each([
    ['project_id', 'not-a-uuid'],
    ['project_score_id', 'not-a-uuid'],
    ['axis', 'combined'],
    ['factor_code', '  '],
    ['contribution', -0.01],
    ['contribution', 100.01],
    ['input_value', -0.01],
    ['input_value', 100.01],
    ['detail', '   '],
    ['detail', 'a'.repeat(501)],
  ] as const)('rejects invalid public factor %s values', (field, value) => {
    expect(publicProjectScoreFactorRowSchema.safeParse({ ...factorRow, [field]: value }).success).toBe(false);
  });

  it.each([
    ['project_id', 'not-a-uuid'],
    ['project_score_id', 'not-a-uuid'],
    ['signal_id', 'not-a-uuid'],
    ['evidence_id', 'not-a-uuid'],
    ['source_id', 'not-a-uuid'],
    ['signal_published_at', 'not-a-timestamp'],
    ['evidence_verified_at', 'not-a-timestamp'],
    ['source_relation_verified_at', 'not-a-timestamp'],
    ['signal_verification', 'unsupported'],
    ['evidence_source_field', 'url'],
    ['source_type', 'unsupported'],
    ['signal_title', '   '],
    ['source_name', '   '],
    ['citation_text', 'a'.repeat(9)],
    ['citation_text', 'a'.repeat(501)],
  ] as const)('rejects invalid public citation %s values', (field, value) => {
    expect(publicProjectEvidenceCitationRowSchema.safeParse({ ...citationRow, [field]: value }).success).toBe(false);
  });

  it('requires a verified source relation for official sources', () => {
    expect(publicProjectEvidenceCitationRowSchema.safeParse({
      ...citationRow,
      source_relation_verified_at: null,
    }).success).toBe(false);
    expect(publicProjectEvidenceCitationRowSchema.parse({
      ...citationRow,
      source_is_official: false,
      source_relation_verified_at: null,
    })).toEqual({
      ...citationRow,
      source_is_official: false,
      source_relation_verified_at: null,
    });
  });

  it('defines the shared independent scoring axes', () => {
    expect(scoringAxisSchema.options).toEqual(['opportunity', 'risk', 'confidence']);
  });
});
