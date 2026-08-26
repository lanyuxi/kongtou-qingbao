import { describe, expect, it } from 'vitest';

import {
  publicBlockedProjectSecurityRowSchema,
  publicProjectSecurityStateSchema,
  publicSecurityIndicatorSchema,
  reviewerSecurityCandidateDetailSchema,
} from '../index.js';

const projectId = 'a3000000-0000-4000-8000-000000000001';
const incidentId = 'a3000000-0000-4000-8000-000000000002';
const indicatorId = 'a3000000-0000-4000-8000-000000000003';

describe('security projection contracts', () => {
  it('accepts a safe blocked-project projection with only public-safe indicator text', () => {
    const row = {
      version: 1,
      project: { id: projectId, slug: 'example', name: 'Example' },
      posture: 'blocked',
      category: 'phishing',
      severity: 'critical',
      publicSummary: '该项目当前存在经审查的安全限制，请勿执行相关操作。',
      firstObservedAt: '2026-08-26T00:00:00.000Z',
      lastVerifiedAt: '2026-08-26T01:00:00.000Z',
      target: { type: 'project', id: projectId },
      indicators: [{ id: indicatorId, type: 'domain', value: 'claim.example' }],
    } as const;
    expect(publicBlockedProjectSecurityRowSchema.parse(row)).toEqual(row);
    expect(publicSecurityIndicatorSchema.safeParse({
      id: indicatorId,
      type: 'domain',
      value: 'claim.example',
      publicSafe: true,
    }).success).toBe(false);
  });

  it('keeps reviewer-only investigation fields out of public projections', () => {
    const candidate = {
      version: 1,
      candidateId: incidentId,
      origin: 'reviewer_manual',
      state: 'pending',
      stateVersion: 1,
      target: { type: 'project', id: projectId },
      indicator: { type: 'domain', value: 'claim.example' },
      summary: '该域名冒充项目领取页面。',
      evidenceId: indicatorId,
      note: '内部调查备注',
      submittedByUserId: incidentId,
      createdAt: '2026-08-26T00:00:00.000Z',
    } as const;
    expect(reviewerSecurityCandidateDetailSchema.parse(candidate)).toEqual(candidate);
    expect(publicBlockedProjectSecurityRowSchema.safeParse({
      version: 1,
      project: { id: projectId, slug: 'example', name: 'Example' },
      posture: 'blocked',
      category: 'phishing',
      severity: 'critical',
      publicSummary: '该项目当前存在经审查的安全限制，请勿执行相关操作。',
      firstObservedAt: '2026-08-26T00:00:00.000Z',
      lastVerifiedAt: '2026-08-26T01:00:00.000Z',
      target: { type: 'project', id: projectId },
      indicators: [],
      note: 'internal',
    }).success).toBe(false);
  });

  it('rejects resolved incidents from the active project incident collection', () => {
    const incident = {
      version: 1,
      incidentId,
      target: { type: 'project', id: projectId },
      category: 'phishing',
      severity: 'high',
      state: 'active',
      publicSummary: '该项目当前存在经审查的安全限制，请勿执行相关操作。',
      firstObservedAt: '2026-08-26T00:00:00.000Z',
      lastVerifiedAt: '2026-08-26T01:00:00.000Z',
      indicators: [],
    } as const;
    expect(publicProjectSecurityStateSchema.parse({
      version: 1,
      projectId,
      posture: 'blocked',
      activeIncidents: [incident],
    }).activeIncidents).toEqual([incident]);
    expect(publicProjectSecurityStateSchema.safeParse({
      version: 1,
      projectId,
      posture: 'clear',
      activeIncidents: [{ ...incident, state: 'resolved' }],
    }).success).toBe(false);
  });

  it('rejects non-project and mismatched targets from blocked project rows', () => {
    const row = {
      version: 1,
      project: { id: projectId, slug: 'example', name: 'Example' },
      posture: 'blocked',
      category: 'phishing',
      severity: 'critical',
      publicSummary: '该项目当前存在经审查的安全限制，请勿执行相关操作。',
      firstObservedAt: '2026-08-26T00:00:00.000Z',
      lastVerifiedAt: '2026-08-26T01:00:00.000Z',
      target: { type: 'project', id: projectId },
      indicators: [],
    } as const;
    expect(publicBlockedProjectSecurityRowSchema.parse(row)).toEqual(row);
    expect(publicBlockedProjectSecurityRowSchema.safeParse({
      ...row,
      target: { type: 'source', id: incidentId },
    }).success).toBe(false);
    expect(publicBlockedProjectSecurityRowSchema.safeParse({
      ...row,
      target: { type: 'project', id: incidentId },
    }).success).toBe(false);
  });
});
