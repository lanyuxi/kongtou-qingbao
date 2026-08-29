import type {
  ReviewerSecurityCandidateDetail,
  ReviewerSecurityIncidentDetail,
} from '@airdrop/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  SecurityCandidateDetail,
  buildCandidateReviewCommand,
  submitCandidateReviewOnce,
} from '../components/review/security-candidate-detail.js';
import {
  SecurityCandidateList,
  applySecurityCandidateCursor,
  changeSecurityCandidateFilters,
} from '../components/review/security-candidate-list.js';
import {
  buildManualSecurityCandidateCommand,
  SecurityCandidateForm,
} from '../components/review/security-candidate-form.js';
import {
  SecurityIncidentDetail,
} from '../components/review/security-incident-detail.js';
import {
  buildSecurityIncidentCommand,
  SecurityIncidentCommandForm,
  submitSecurityIncidentCommandOnce,
} from '../components/review/security-incident-command-form.js';
import {
  SecurityIncidentList,
  applySecurityIncidentCursor,
  changeSecurityIncidentFilters,
} from '../components/review/security-incident-list.js';
import {
  SecurityIndicatorDisclosureForm,
  buildIndicatorDisclosureCommand,
  submitIndicatorDisclosureOnce,
} from '../components/review/security-indicator-disclosure-form.js';
import { createPendingActionGate } from '../lib/review-pending-action.js';
import type { SecurityReviewApiClient } from '../lib/security-review-api-client.js';

const candidateId = 'a1000000-0000-4000-8000-000000000001';
const sourceId = 'a1000000-0000-4000-8000-000000000002';
const evidenceId = 'a1000000-0000-4000-8000-000000000003';
const incidentId = 'a1000000-0000-4000-8000-000000000004';
const indicatorId = 'a1000000-0000-4000-8000-000000000005';

const candidate: ReviewerSecurityCandidateDetail = {
  version: 1,
  candidateId,
  origin: 'reviewer_manual',
  state: 'pending',
  stateVersion: 4,
  target: { type: 'project', id: candidateId },
  targetContext: null,
  indicator: { type: 'domain', value: 'unsafe.example' },
  evidenceId,
  summary: 'A verified phishing domain targets this project.',
  note: 'Evidence was independently reviewed.',
  submittedByUserId: sourceId,
  createdAt: '2026-08-29T01:00:00.000Z',
};

const incident: ReviewerSecurityIncidentDetail = {
  version: 1,
  incident: {
    version: 1,
    incidentId,
    state: 'active',
    target: { type: 'project', id: candidateId },
    category: 'phishing',
    currentPosture: 'blocked',
    currentSeverity: 'high',
    publicSummary: 'A verified phishing campaign targets this project.',
    incidentVersion: 3,
    openedAt: '2026-08-28T01:00:00.000Z',
    lastDecisionAt: '2026-08-29T01:00:00.000Z',
  },
  indicatorIds: [indicatorId],
  decisions: [
    {
      version: 1,
      decisionId: 'a1000000-0000-4000-8000-000000000006',
      incidentVersion: 1,
      action: 'open',
      reasonCode: 'precautionary_evidence',
      resultingPosture: 'blocked',
      resultingSeverity: 'high',
      publicSummary: 'A verified phishing campaign targets this project.',
      note: 'Initial evidence.',
      evidenceId,
      reviewerUserId: sourceId,
      createdAt: '2026-08-28T01:00:00.000Z',
    },
    {
      version: 1,
      decisionId: 'a1000000-0000-4000-8000-000000000007',
      incidentVersion: 3,
      action: 'adjust',
      reasonCode: 'evidence_escalated',
      resultingPosture: 'blocked',
      resultingSeverity: 'critical',
      publicSummary: 'The verified phishing activity escalated in severity.',
      note: null,
      evidenceId,
      reviewerUserId: sourceId,
      createdAt: '2026-08-29T01:00:00.000Z',
    },
  ],
};

describe('security review components', () => {
  it('keeps script-like candidate strings inert instead of rendering navigable or executable markup', () => {
    const html = renderToStaticMarkup(createElement(SecurityCandidateDetail, {
      candidate: { ...candidate, summary: '<script>alert(1)</script>', note: '<a href="https://unsafe.example">click</a>', indicator: { type: 'url', value: '<img src=x onerror=alert(1)>' } },
    }));

    expect(html).toContain('[内容已隐藏]');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="https://unsafe.example">');
    expect(html).not.toContain('<img');
  });

  it('resets candidate filters and incident filters to the first page while preserving a supplied cursor only for next-page navigation', () => {
    expect(changeSecurityCandidateFilters({ origin: 'all', state: 'all', targetType: 'all', cursor: 'old', limit: 25 }, { origin: 'reviewer_manual', state: 'pending' })).toEqual({ origin: 'reviewer_manual', state: 'pending', targetType: 'all', cursor: null, limit: 25 });
    expect(applySecurityCandidateCursor({ origin: 'all', state: 'all', targetType: 'all', cursor: null, limit: 25 }, 'next')).toMatchObject({ cursor: 'next' });
    expect(changeSecurityIncidentFilters({ state: 'all', targetType: 'all', cursor: 'old', limit: 25 }, { state: 'active' })).toEqual({ state: 'active', targetType: 'all', cursor: null, limit: 25 });
    expect(applySecurityIncidentCursor({ state: 'all', targetType: 'all', cursor: null, limit: 25 }, 'next')).toMatchObject({ cursor: 'next' });
  });

  it('shows manual evidence-only entry fields and requires an explicit target type and identifier', () => {
    const html = renderToStaticMarkup(createElement(SecurityCandidateForm, { api: unavailableApi(), onComplete: async () => {}, onSessionExpired: () => {} }));
    expect(html).toContain('证据 ID');
    expect(html).toContain('目标类型');
    expect(html).toContain('目标 ID');
    expect(buildManualSecurityCandidateCommand({ targetType: 'project', targetId: '', evidenceId, indicatorType: 'domain', indicatorValue: 'unsafe.example', summary: candidate.summary, note: '' })).toBeNull();
  });

  it('builds accept-and-open and accept-and-attach commands with reviewer-selected target, evidence, and displayed versions', () => {
    expect(buildCandidateReviewCommand(candidate, {
      decision: 'accept_and_open', targetType: 'source', targetId: sourceId, evidenceId, indicatorType: 'domain', indicatorValue: 'unsafe.example', category: 'phishing', resultingPosture: 'blocked', resultingSeverity: 'high', publicSummary: incident.incident.publicSummary, incidentId: '', expectedIncidentVersion: '', note: '',
    })).toEqual({ version: 1, candidateId, expectedCandidateVersion: 4, decision: 'accept_and_open', reasonCode: 'evidence_verified', target: { type: 'source', id: sourceId }, evidenceId, indicator: { type: 'domain', value: 'unsafe.example' }, category: 'phishing', resultingPosture: 'blocked', resultingSeverity: 'high', publicSummary: incident.incident.publicSummary, note: null });
    expect(buildCandidateReviewCommand(candidate, {
      decision: 'accept_and_attach', targetType: 'project', targetId: candidateId, evidenceId, indicatorType: 'domain', indicatorValue: 'unsafe.example', category: 'phishing', resultingPosture: 'blocked', resultingSeverity: 'high', publicSummary: incident.incident.publicSummary, incidentId, expectedIncidentVersion: '3', note: 'Attach evidence.',
    })).toEqual({ version: 1, candidateId, expectedCandidateVersion: 4, decision: 'accept_and_attach', reasonCode: 'evidence_verified', target: { type: 'project', id: candidateId }, incidentId, expectedIncidentVersion: 3, evidenceId, indicator: { type: 'domain', value: 'unsafe.example' }, note: 'Attach evidence.' });
  });

  it('renders complete immutable incident history and high-impact command confirmation before submission', () => {
    const detailHtml = renderToStaticMarkup(createElement(SecurityIncidentDetail, { detail: incident }));
    const formHtml = renderToStaticMarkup(createElement(SecurityIncidentCommandForm, { api: unavailableApi(), incident: incident.incident, onRefresh: async () => {}, onSessionExpired: () => {} }));
    expect(detailHtml).toContain('不可变更的事件历史');
    expect(detailHtml).toContain('v1 · open');
    expect(detailHtml).toContain('v3 · adjust');
    for (const label of ['目标', '当前处置', '拟议处置', '严重性', '类别', '原因', '证据 ID', '公开摘要']) expect(formHtml).toContain(label);
  });

  it('builds resolve and reopen incident commands only with the displayed incident version and a full public-safe summary', () => {
    expect(buildSecurityIncidentCommand(incident.incident, { action: 'resolve', evidenceId, reasonCode: 'mitigation_verified', resultingPosture: 'clear', resultingSeverity: 'medium', publicSummary: 'The reported malicious content was independently mitigated.', note: '' })).toEqual({ version: 1, action: 'resolve', incidentId, expectedIncidentVersion: 3, evidenceId, reasonCode: 'mitigation_verified', resultingSeverity: 'medium', publicSummary: 'The reported malicious content was independently mitigated.', note: null });
    expect(buildSecurityIncidentCommand(incident.incident, { action: 'reopen', evidenceId, reasonCode: 'precautionary_evidence', resultingPosture: 'caution', resultingSeverity: 'high', publicSummary: 'New verified evidence requires renewed protective monitoring.', note: 'New evidence.' })).toEqual({ version: 1, action: 'reopen', incidentId, expectedIncidentVersion: 3, evidenceId, reasonCode: 'precautionary_evidence', resultingPosture: 'caution', resultingSeverity: 'high', publicSummary: 'New verified evidence requires renewed protective monitoring.', note: 'New evidence.' });
  });

  it('requires an explicit positive indicator version and shows the conservative disclosure limitation', () => {
    const html = renderToStaticMarkup(createElement(SecurityIndicatorDisclosureForm, { api: unavailableApi(), indicatorId, onRefresh: async () => {}, onSessionExpired: () => {} }));
    expect(html).toContain('当前指标版本');
    expect(html).toContain('不会自动推导、递增或在冲突后重试');
    expect(buildIndicatorDisclosureCommand({ indicatorId, expectedIndicatorVersion: '', decision: 'publish', reasonCode: 'safe_for_public_warning', note: '' })).toBeNull();
    expect(buildIndicatorDisclosureCommand({ indicatorId, expectedIndicatorVersion: '2', decision: 'withdraw', reasonCode: 'sensitive_indicator', note: 'Sensitive indicator.' })).toEqual({ version: 1, indicatorId, expectedIndicatorVersion: 2, decision: 'withdraw', reasonCode: 'sensitive_indicator', note: 'Sensitive indicator.' });
  });

  it('clears pending state, reloads once, and never resubmits after a security version conflict', async () => {
    let calls = 0;
    let reloads = 0;
    const result = await submitCandidateReviewOnce(createPendingActionGate(), {
      api: { ...unavailableApi(), reviewCandidate: async () => { calls += 1; return { ok: false, state: 'conflict', code: 'security_version_conflict' } as const; } },
      candidate,
      draft: { decision: 'reject', targetType: 'project', targetId: candidateId, evidenceId, indicatorType: 'domain', indicatorValue: 'unsafe.example', category: 'phishing', resultingPosture: 'blocked', resultingSeverity: 'high', publicSummary: incident.incident.publicSummary, incidentId: '', expectedIncidentVersion: '', note: '' },
      refresh: async () => { reloads += 1; },
      sessionExpired: () => { throw new Error('unexpected expiration'); },
    });
    expect(result).toEqual({ status: 'conflict', message: '安全记录已更新，请检查最新版本后重新提交。' });
    expect(calls).toBe(1);
    expect(reloads).toBe(1);
  });

  it('clears reviewer session on 401 or 403 instead of leaving a usable mutation form', async () => {
    let expired = 0;
    const result = await submitSecurityIncidentCommandOnce(createPendingActionGate(), {
      api: { ...unavailableApi(), commandIncident: async () => ({ ok: false, state: 'forbidden' } as const) },
      incident: incident.incident,
      draft: { action: 'adjust', evidenceId, reasonCode: 'evidence_escalated', resultingPosture: 'blocked', resultingSeverity: 'critical', publicSummary: 'The verified phishing activity escalated in severity.', note: '' },
      refresh: async () => {},
      sessionExpired: () => { expired += 1; },
    });
    expect(result).toEqual({ status: 'forbidden', message: '当前账号没有有效的审核权限。' });
    expect(expired).toBe(1);
  });

  it('does not retry disclosure submission after conflict', async () => {
    let calls = 0;
    let reloads = 0;
    const result = await submitIndicatorDisclosureOnce(createPendingActionGate(), {
      api: { ...unavailableApi(), setIndicatorDisclosure: async () => { calls += 1; return { ok: false, state: 'conflict', code: 'security_version_conflict' } as const; } },
      draft: { indicatorId, expectedIndicatorVersion: '2', decision: 'publish', reasonCode: 'safe_for_public_warning', note: '' },
      refresh: async () => { reloads += 1; },
      sessionExpired: () => { throw new Error('unexpected expiration'); },
    });
    expect(result).toEqual({ status: 'conflict', message: '安全记录已更新，请检查最新版本后重新提交。' });
    expect(calls).toBe(1);
    expect(reloads).toBe(1);
  });

  it('keeps a duplicate candidate submission disabled while the pending gate owns the first request', async () => {
    let calls = 0;
    const gate = createPendingActionGate();
    expect(gate.begin()).toBe(true);
    const result = await submitCandidateReviewOnce(gate, {
      api: { ...unavailableApi(), reviewCandidate: async () => { calls += 1; return { ok: false, state: 'request_failed' } as const; } },
      candidate,
      draft: { decision: 'reject', targetType: 'project', targetId: candidateId, evidenceId, indicatorType: 'domain', indicatorValue: 'unsafe.example', category: 'phishing', resultingPosture: 'blocked', resultingSeverity: 'high', publicSummary: incident.incident.publicSummary, incidentId: '', expectedIncidentVersion: '', note: '' },
      refresh: async () => {},
      sessionExpired: () => { throw new Error('unexpected expiration'); },
    });
    expect(result).toEqual({ status: 'submitting' });
    expect(calls).toBe(0);
    gate.finish();
  });

  it('renders candidate and incident list navigation only from reviewed identifiers', () => {
    const candidateHtml = renderToStaticMarkup(createElement(SecurityCandidateList, { query: { origin: 'all', state: 'all', targetType: 'all', cursor: null, limit: 25 }, state: { status: 'ready', items: [{ version: 1, candidateId, origin: 'reviewer_manual', state: 'pending', stateVersion: 0, target: { type: 'project', id: candidateId }, summary: 'A verified phishing domain targets this project.', createdAt: '2026-08-29T01:00:00.000Z', reviewedAt: null }], nextCursor: null } }));
    const incidentHtml = renderToStaticMarkup(createElement(SecurityIncidentList, { query: { state: 'all', targetType: 'all', cursor: null, limit: 25 }, state: { status: 'ready', items: [incident.incident], nextCursor: null } }));
    expect(candidateHtml).toContain(`/review/security/candidates/${candidateId}`);
    expect(incidentHtml).toContain(`/review/security/incidents/${incidentId}`);
  });
});

function unavailableApi(): SecurityReviewApiClient {
  const failure = async () => ({ ok: false, state: 'request_failed' } as const);
  return {
    listCandidates: failure,
    getCandidate: failure,
    submitManualCandidate: failure,
    reviewCandidate: failure,
    listIncidents: failure,
    getIncident: failure,
    openIncident: failure,
    commandIncident: failure,
    setIndicatorDisclosure: failure,
  };
}
