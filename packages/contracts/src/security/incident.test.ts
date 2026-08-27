import { describe, expect, it } from 'vitest';

import {
  reviewerSecurityIncidentListItemSchema,
  securityCandidateReviewCommandV1Schema,
  securityIncidentCommandV1Schema,
} from '../index.js';

const candidateId = 'a2000000-0000-4000-8000-000000000001';
const incidentId = 'a2000000-0000-4000-8000-000000000002';
const indicatorId = 'a2000000-0000-4000-8000-000000000003';
const evidenceId = 'a2000000-0000-4000-8000-000000000004';
const projectId = 'a2000000-0000-4000-8000-000000000005';

describe('security review and incident command contracts', () => {
  it('accepts only compatible candidate decision/reason pairs', () => {
    expect(securityCandidateReviewCommandV1Schema.parse({
      version: 1,
      candidateId,
      expectedCandidateVersion: 1,
      decision: 'needs_review',
      reasonCode: 'grounding_failed',
      note: null,
    })).toMatchObject({ decision: 'needs_review', reasonCode: 'grounding_failed' });
    expect(securityCandidateReviewCommandV1Schema.safeParse({
      version: 1,
      candidateId,
      expectedCandidateVersion: 1,
      decision: 'reject',
      reasonCode: 'evidence_verified',
      note: null,
    }).success).toBe(false);

    const attach = {
      version: 1,
      candidateId,
      expectedCandidateVersion: 1,
      decision: 'accept_and_attach',
      reasonCode: 'evidence_verified',
      target: { type: 'project', id: projectId },
      incidentId,
      expectedIncidentVersion: 2,
      evidenceId,
      indicator: { type: 'domain', value: 'phish.example' },
      note: null,
    } as const;
    expect(securityCandidateReviewCommandV1Schema.parse(attach)).toEqual(attach);
    expect(securityCandidateReviewCommandV1Schema.safeParse({
      ...attach,
      expectedIncidentVersion: undefined,
    }).success).toBe(false);
  });

  it('accepts an evidence-grounded incident open and rejects incompatible action reasons', () => {
    const command = {
      version: 1,
      action: 'open',
      target: { type: 'project', id: projectId },
      category: 'phishing',
      indicatorId,
      evidenceId,
      resultingPosture: 'blocked',
      resultingSeverity: 'high',
      publicSummary: '该项目出现经过证据支持的钓鱼风险，请停止当前操作。',
      note: null,
      reasonCode: 'precautionary_evidence',
    } as const;
    expect(securityIncidentCommandV1Schema.parse(command)).toEqual(command);
    expect(securityIncidentCommandV1Schema.safeParse({
      ...command,
      reasonCode: 'mitigation_verified',
    }).success).toBe(false);
  });

  it('rejects unsafe incident summary, version, and action shapes', () => {
    const resolve = {
      version: 1,
      action: 'resolve',
      incidentId,
      expectedIncidentVersion: 1,
      evidenceId,
      resultingSeverity: 'high',
      publicSummary: '风险处置证据已完成核验，当前限制已解除并保留历史记录。',
      note: null,
      reasonCode: 'mitigation_verified',
    } as const;
    expect(securityIncidentCommandV1Schema.safeParse({ ...resolve, version: 2 }).success).toBe(false);
    expect(securityIncidentCommandV1Schema.safeParse({ ...resolve, publicSummary: 'a'.repeat(19) }).success).toBe(false);
    expect(securityIncidentCommandV1Schema.safeParse({ ...resolve, publicSummary: 'a'.repeat(501) }).success).toBe(false);
    expect(securityIncidentCommandV1Schema.safeParse({ ...resolve, resultingPosture: 'clear' }).success).toBe(false);
    expect(securityIncidentCommandV1Schema.safeParse({ ...resolve, extra: true }).success).toBe(false);
  });

  it('requires a posture exactly when a reviewer incident is active', () => {
    const item = {
      version: 1,
      incidentId,
      target: { type: 'project', id: projectId },
      category: 'phishing',
      state: 'active',
      currentPosture: 'blocked',
      currentSeverity: 'high',
      publicSummary: '该项目出现经过证据支持的钓鱼风险，请停止当前操作。',
      incidentVersion: 1,
      openedAt: '2026-08-26T00:00:00.000Z',
      lastDecisionAt: '2026-08-26T01:00:00.000Z',
    } as const;
    expect(reviewerSecurityIncidentListItemSchema.parse(item)).toEqual(item);
    expect(reviewerSecurityIncidentListItemSchema.parse({
      ...item,
      state: 'resolved',
      currentPosture: null,
    })).toEqual({
      ...item,
      state: 'resolved',
      currentPosture: null,
    });
    expect(reviewerSecurityIncidentListItemSchema.safeParse({
      ...item,
      currentPosture: null,
    }).success).toBe(false);
    expect(reviewerSecurityIncidentListItemSchema.safeParse({
      ...item,
      state: 'resolved',
    }).success).toBe(false);
  });
});
