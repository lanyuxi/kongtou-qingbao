import { describe, expect, it } from 'vitest';

import {
  manualSecurityCandidateCommandV1Schema,
  securityCandidateListQuerySchema,
  securityTargetSchema,
} from '../index.js';

const projectId = 'a1000000-0000-4000-8000-000000000001';
const sourceId = 'a1000000-0000-4000-8000-000000000002';
const evidenceId = 'a1000000-0000-4000-8000-000000000003';
const cursor =
  'eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTI2VDAwOjAwOjAwLjAwMFoiLCJpZCI6ImExMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9';

const manualCommand = {
  version: 1,
  target: { type: 'project', id: projectId },
  evidenceId,
  indicator: { type: 'domain', value: 'claim.example' },
  summary: '该域名冒充项目领取页面。',
  note: null,
} as const;

describe('security candidate contracts', () => {
  it('accepts a reviewer manual candidate without caller-supplied reviewer identity', () => {
    expect(manualSecurityCandidateCommandV1Schema.parse(manualCommand)).toEqual(manualCommand);
    expect(manualSecurityCandidateCommandV1Schema.safeParse({
      ...manualCommand,
      reviewerUserId: sourceId,
    }).success).toBe(false);
  });

  it.each([
    ['project', projectId],
    ['source', sourceId],
  ] as const)('accepts a single %s target', (type, id) => {
    expect(securityTargetSchema.parse({ type, id })).toEqual({ type, id });
  });

  it('rejects mixed targets and unsafe manual candidate bounds', () => {
    expect(securityTargetSchema.safeParse({ type: 'project', id: projectId, sourceId }).success).toBe(false);
    for (const value of ['', 'a'.repeat(501)]) {
      expect(manualSecurityCandidateCommandV1Schema.safeParse({
        ...manualCommand,
        indicator: { type: 'domain', value },
      }).success).toBe(false);
    }
    expect(manualSecurityCandidateCommandV1Schema.safeParse({
      ...manualCommand,
      summary: '短摘要',
    }).success).toBe(false);
    expect(manualSecurityCandidateCommandV1Schema.safeParse({
      ...manualCommand,
      summary: 'a'.repeat(2001),
    }).success).toBe(false);
    expect(manualSecurityCandidateCommandV1Schema.safeParse({
      ...manualCommand,
      note: '',
    }).success).toBe(false);
    expect(manualSecurityCandidateCommandV1Schema.safeParse({
      ...manualCommand,
      note: 'a'.repeat(1001),
    }).success).toBe(false);
  });

  it('uses an opaque strict base64url cursor query', () => {
    expect(securityCandidateListQuerySchema.parse({ cursor })).toEqual({
      origin: 'all',
      state: 'all',
      targetType: 'all',
      cursor,
      limit: 25,
    });
    for (const invalid of ['not-a-cursor', '@@@', 'e30']) {
      expect(securityCandidateListQuerySchema.safeParse({ cursor: invalid }).success).toBe(false);
    }
    expect(securityCandidateListQuerySchema.safeParse({ cursor, extra: true }).success).toBe(false);
  });
});
