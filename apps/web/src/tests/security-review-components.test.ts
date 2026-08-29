import type {
  ReviewerSecurityCandidateDetail,
  ReviewerSecurityIncidentDetail,
} from '@airdrop/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as candidateDetailModule from '../components/review/security-candidate-detail.js';

import {
  SecurityCandidateDetail,
  buildCandidateReviewCommand,
  loadCandidateAttachment,
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

  it('renders a contract-validated source target while keeping hostile candidate fields hidden', () => {
    const html = renderToStaticMarkup(createElement(SecurityCandidateDetail, {
      candidate: { ...candidate, target: { type: 'source', id: sourceId }, summary: '<script>alert(1)</script>', note: '<a href="https://unsafe.example">click</a>', indicator: { type: 'url', value: '<img src=x onerror=alert(1)>' } },
    }));

    expect(html).toContain(`source · ${sourceId}`);
    expect(html).toContain('[内容已隐藏]');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="https://unsafe.example">');
    expect(html).not.toContain('<img');
  });

  it('renders contract-validated extraction context while keeping hostile candidate fields hidden', () => {
    const extractionCandidate: ReviewerSecurityCandidateDetail = { version: 1, candidateId, origin: 'extraction', state: 'pending', stateVersion: 4, target: null, targetContext: { projectId: candidateId, sourceId }, indicator: null, evidenceId: null, summary: '<script>alert(1)</script>', note: null, submittedByUserId: null, createdAt: candidate.createdAt };
    const html = renderToStaticMarkup(createElement(SecurityCandidateDetail, {
      candidate: extractionCandidate,
    }));

    expect(html).toContain(`提取上下文 · project ${candidateId} · source ${sourceId}`);
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
    }, incident.incident)).toEqual({ version: 1, candidateId, expectedCandidateVersion: 4, decision: 'accept_and_attach', reasonCode: 'evidence_verified', target: { type: 'project', id: candidateId }, incidentId, expectedIncidentVersion: 3, evidenceId, indicator: { type: 'domain', value: 'unsafe.example' }, note: 'Attach evidence.' });
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
      confirmation: { affirmed: true, snapshot: { action: 'adjust', evidenceId, reasonCode: 'evidence_escalated', resultingPosture: 'blocked', resultingSeverity: 'critical', publicSummary: 'The verified phishing activity escalated in severity.', note: '' }, incident: incident.incident },
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
      confirmation: { affirmed: true, snapshot: { indicatorId, expectedIndicatorVersion: '2', decision: 'publish', reasonCode: 'safe_for_public_warning', note: '' } },
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

  it('blocks an unconfirmed candidate accept command and invalidates a stale confirmation before any mutation', async () => {
    const draft = candidateAcceptOpenDraft();
    const staleDraft = { ...draft, publicSummary: 'A different verified public warning requires a new confirmation.' };
    for (const confirmation of [
      { affirmed: false, snapshot: draft, attachedIncident: null },
      { affirmed: true, snapshot: staleDraft, attachedIncident: null },
    ]) {
      let calls = 0;
      const input = {
        api: { ...unavailableApi(), reviewCandidate: async () => { calls += 1; return candidateReviewSuccess(); } },
        candidate,
        draft,
        confirmation,
        attachedIncident: null,
        refresh: async () => {},
        sessionExpired: () => { throw new Error('unexpected expiration'); },
      } as unknown as Parameters<typeof submitCandidateReviewOnce>[1] & { readonly confirmation: unknown; readonly attachedIncident: unknown };
      await expect(submitCandidateReviewOnce(createPendingActionGate(), input)).resolves.toMatchObject({ status: 'failed' });
      expect(calls).toBe(0);
    }
  });

  it('uses only loaded protected incident context for attach and refuses an unloaded attachment', () => {
    const attached = { ...incident.incident, incidentId, incidentVersion: 8, target: { type: 'source' as const, id: sourceId }, currentPosture: 'caution' as const, currentSeverity: 'critical' as const, publicSummary: 'A verified source-target incident is currently under protective review.' };
    const draft = { ...candidateAcceptAttachDraft(), targetType: 'project' as const, targetId: candidateId, expectedIncidentVersion: '3' };
    const buildWithContext = buildCandidateReviewCommand as unknown as (value: ReviewerSecurityCandidateDetail, next: typeof draft, context: typeof attached | null) => unknown;
    expect(buildWithContext(candidate, draft, null)).toBeNull();
    expect(buildWithContext(candidate, draft, attached)).toMatchObject({ target: { type: 'source', id: sourceId }, expectedIncidentVersion: 8 });
  });

  it('shows the loaded attached incident posture as the unchanged proposed posture', () => {
    const attached = { ...incident.incident, currentPosture: 'caution' as const };
    const values = (candidateDetailModule as unknown as {
      candidateConfirmationValues: (draft: ReturnType<typeof candidateAcceptAttachDraft>, context: typeof attached) => { proposedPosture: string };
    }).candidateConfirmationValues(candidateAcceptAttachDraft(), attached);
    expect(values.proposedPosture).toContain('caution');
    expect(values.proposedPosture).toContain('保持不变');
  });

  it('refuses a candidate confirmation after the authoritative candidate version changed without calling the API', async () => {
    let calls = 0;
    const draft = candidateAcceptOpenDraft();
    const confirmation = { affirmed: true, snapshot: draft, attachedIncident: null, candidate: { candidateId, stateVersion: 4 } };
    const result = await submitCandidateReviewOnce(createPendingActionGate(), {
      api: { ...unavailableApi(), reviewCandidate: async () => { calls += 1; return candidateReviewSuccess(); } },
      candidate: { ...candidate, stateVersion: 5 },
      draft,
      attachedIncident: null,
      confirmation,
      refresh: async () => {},
      sessionExpired: () => {},
    } as Parameters<typeof submitCandidateReviewOnce>[1] & { readonly confirmation: unknown });
    expect(result).toMatchObject({ status: 'failed' });
    expect(calls).toBe(0);
  });

  it('refuses an incident confirmation after authoritative version or displayed context changed without calling the API', async () => {
    let calls = 0;
    const draft = incidentAdjustDraft();
    const confirmation = { affirmed: true, snapshot: draft, incident: incident.incident };
    const current = { ...incident.incident, incidentVersion: 4, currentPosture: 'caution' as const, publicSummary: 'A changed verified warning requires a fresh confirmation.' };
    const result = await submitSecurityIncidentCommandOnce(createPendingActionGate(), {
      api: { ...unavailableApi(), commandIncident: async () => { calls += 1; return incidentCommandSuccess(); } },
      incident: current,
      draft,
      confirmation,
      refresh: async () => {},
      sessionExpired: () => {},
    } as Parameters<typeof submitSecurityIncidentCommandOnce>[1] & { readonly confirmation: unknown });
    expect(result).toMatchObject({ status: 'failed' });
    expect(calls).toBe(0);
  });

  it('clears confirmation after a conflict without replacing a reviewer-entered disclosure version', () => {
    const transition = (candidateDetailModule as unknown as {
      clearConfirmationOnConflict: <T>(confirmation: T | null, state: { status: string }) => T | null;
    }).clearConfirmationOnConflict;
    const confirmation = { affirmed: true, snapshot: disclosureDraft() };
    expect(transition(confirmation, { status: 'conflict' })).toBeNull();
    expect(transition(confirmation, { status: 'saved' })).toEqual(confirmation);
    expect(confirmation.snapshot.expectedIndicatorVersion).toBe('2');
  });

  it('renders a contract-validated source target while keeping hostile confirmation free text inert', () => {
    const sourceIncident = { ...incident.incident, target: { type: 'source' as const, id: sourceId }, publicSummary: '<script>alert(1)</script>' };
    const html = renderToStaticMarkup(createElement(SecurityIncidentCommandForm, { api: unavailableApi(), incident: sourceIncident, onRefresh: async () => {}, onSessionExpired: () => {} }));
    expect(html).toContain(`source · ${sourceId}`);
    expect(html).toContain('[内容已隐藏]');
    expect(html).not.toContain('<script>');
  });

  it('blocks every unconfirmed incident command and disclosure action, including their initial rendered submit controls', async () => {
    const incidentHtml = renderToStaticMarkup(createElement(SecurityIncidentCommandForm, { api: unavailableApi(), incident: incident.incident, onRefresh: async () => {}, onSessionExpired: () => {} }));
    const disclosureHtml = renderToStaticMarkup(createElement(SecurityIndicatorDisclosureForm, { api: unavailableApi(), indicatorId, onRefresh: async () => {}, onSessionExpired: () => {} }));
    expect(incidentHtml).toMatch(/<button[^>]*disabled=""[^>]*>提交事件命令/);
    expect(disclosureHtml).toMatch(/<button[^>]*disabled=""[^>]*>提交披露决定/);

    let incidentCalls = 0;
    const incidentInput = {
      api: { ...unavailableApi(), commandIncident: async () => { incidentCalls += 1; return incidentCommandSuccess(); } },
      incident: incident.incident,
      draft: incidentAdjustDraft(),
      confirmation: { affirmed: false, snapshot: incidentAdjustDraft() },
      refresh: async () => {},
      sessionExpired: () => { throw new Error('unexpected expiration'); },
    } as unknown as Parameters<typeof submitSecurityIncidentCommandOnce>[1] & { readonly confirmation: unknown };
    await expect(submitSecurityIncidentCommandOnce(createPendingActionGate(), incidentInput)).resolves.toMatchObject({ status: 'failed' });
    expect(incidentCalls).toBe(0);

    let disclosureCalls = 0;
    const disclosureInput = {
      api: { ...unavailableApi(), setIndicatorDisclosure: async () => { disclosureCalls += 1; return disclosureSuccess(); } },
      draft: disclosureDraft(),
      confirmation: { affirmed: false, snapshot: disclosureDraft() },
      refresh: async () => {},
      sessionExpired: () => { throw new Error('unexpected expiration'); },
    } as Parameters<typeof submitIndicatorDisclosureOnce>[1] & { readonly confirmation: unknown };
    await expect(submitIndicatorDisclosureOnce(createPendingActionGate(), disclosureInput)).resolves.toMatchObject({ status: 'failed' });
    expect(disclosureCalls).toBe(0);
  });

  it('rejects stale incident and disclosure confirmation snapshots, while an affirmative current snapshot alone enables submission', async () => {
    let incidentCalls = 0;
    const currentIncidentDraft = incidentAdjustDraft();
    const staleIncident = { ...currentIncidentDraft, publicSummary: 'A materially changed public summary must be confirmed again.' };
    const incidentInput = {
      api: { ...unavailableApi(), commandIncident: async () => { incidentCalls += 1; return incidentCommandSuccess(); } },
      incident: incident.incident,
      draft: currentIncidentDraft,
      confirmation: { affirmed: true, snapshot: staleIncident },
      refresh: async () => {},
      sessionExpired: () => { throw new Error('unexpected expiration'); },
    } as unknown as Parameters<typeof submitSecurityIncidentCommandOnce>[1] & { readonly confirmation: unknown };
    await expect(submitSecurityIncidentCommandOnce(createPendingActionGate(), incidentInput)).resolves.toMatchObject({ status: 'failed' });
    expect(incidentCalls).toBe(0);

    let disclosureCalls = 0;
    const currentDisclosure = disclosureDraft();
    const staleDisclosure = { ...currentDisclosure, expectedIndicatorVersion: '3' };
    const disclosureInput = {
      api: { ...unavailableApi(), setIndicatorDisclosure: async () => { disclosureCalls += 1; return disclosureSuccess(); } },
      draft: currentDisclosure,
      confirmation: { affirmed: true, snapshot: staleDisclosure },
      refresh: async () => {},
      sessionExpired: () => { throw new Error('unexpected expiration'); },
    } as Parameters<typeof submitIndicatorDisclosureOnce>[1] & { readonly confirmation: unknown };
    await expect(submitIndicatorDisclosureOnce(createPendingActionGate(), disclosureInput)).resolves.toMatchObject({ status: 'failed' });
    expect(disclosureCalls).toBe(0);
  });

  it('keeps disclosure version visible and exact across validation and conflicts without retrying', async () => {
    const html = renderToStaticMarkup(createElement(SecurityIndicatorDisclosureForm, { api: unavailableApi(), indicatorId, onRefresh: async () => {}, onSessionExpired: () => {} }));
    expect(html).toContain(indicatorId);
    for (const expectedIndicatorVersion of ['0', '-1', '1.5']) expect(buildIndicatorDisclosureCommand({ ...disclosureDraft(), expectedIndicatorVersion })).toBeNull();
    let calls = 0;
    const draft = disclosureDraft();
    const input = {
      api: { ...unavailableApi(), setIndicatorDisclosure: async () => { calls += 1; return { ok: false, state: 'conflict', code: 'security_version_conflict' } as const; } },
      draft,
      confirmation: { affirmed: true, snapshot: draft },
      refresh: async () => {},
      sessionExpired: () => { throw new Error('unexpected expiration'); },
    } as Parameters<typeof submitIndicatorDisclosureOnce>[1] & { readonly confirmation: unknown };
    await expect(submitIndicatorDisclosureOnce(createPendingActionGate(), input)).resolves.toMatchObject({ status: 'conflict' });
    expect(calls).toBe(1);
    expect(draft.expectedIndicatorVersion).toBe('2');
  });

  it.each(['sign_in_required', 'forbidden'] as const)('clears the candidate reviewer session after %s while loading an attachment', async (state) => {
    let expired = 0;
    const result = await loadCandidateAttachment({ ...unavailableApi(), getIncident: async () => ({ ok: false, state } as const) }, incidentId, () => { expired += 1; });
    expect(result).toEqual({ status: 'forbidden' });
    expect(expired).toBe(1);
  });

  it('permits each high-impact mutation only after an affirmative current confirmation snapshot', async () => {
    let candidateCalls = 0; let incidentCalls = 0; let disclosureCalls = 0;
    const candidateDraft = candidateAcceptOpenDraft();
    const incidentDraft = incidentAdjustDraft();
    const disclosure = disclosureDraft();
    await expect(submitCandidateReviewOnce(createPendingActionGate(), { api: { ...unavailableApi(), reviewCandidate: async () => { candidateCalls += 1; return candidateReviewSuccess(); } }, candidate, draft: candidateDraft, attachedIncident: null, confirmation: { affirmed: true, snapshot: candidateDraft, candidate: { candidateId: candidate.candidateId, stateVersion: candidate.stateVersion }, attachedIncident: null }, refresh: async () => {}, sessionExpired: () => {} })).resolves.toMatchObject({ status: 'saved' });
    await expect(submitSecurityIncidentCommandOnce(createPendingActionGate(), { api: { ...unavailableApi(), commandIncident: async () => { incidentCalls += 1; return incidentCommandSuccess(); } }, incident: incident.incident, draft: incidentDraft, confirmation: { affirmed: true, snapshot: incidentDraft, incident: incident.incident }, refresh: async () => {}, sessionExpired: () => {} })).resolves.toMatchObject({ status: 'saved' });
    await expect(submitIndicatorDisclosureOnce(createPendingActionGate(), { api: { ...unavailableApi(), setIndicatorDisclosure: async () => { disclosureCalls += 1; return disclosureSuccess(); } }, draft: disclosure, confirmation: { affirmed: true, snapshot: disclosure }, refresh: async () => {}, sessionExpired: () => {} })).resolves.toMatchObject({ status: 'saved' });
    expect([candidateCalls, incidentCalls, disclosureCalls]).toEqual([1, 1, 1]);
  });

  it('keeps hostile history and confirmation values inert and suppresses duplicate incident and disclosure requests', async () => {
    const hostile = { ...incident, incident: { ...incident.incident, publicSummary: '<script>alert(1)</script>' }, decisions: [{ ...incident.decisions[0]!, publicSummary: '<img src=x onerror=alert(1)>', note: '<a href="https://unsafe.example">click</a>' }] };
    const historyHtml = renderToStaticMarkup(createElement(SecurityIncidentDetail, { detail: hostile }));
    const commandHtml = renderToStaticMarkup(createElement(SecurityIncidentCommandForm, { api: unavailableApi(), incident: hostile.incident, onRefresh: async () => {}, onSessionExpired: () => {} }));
    expect(historyHtml).toContain('[内容已隐藏]');
    expect(commandHtml).toContain('[内容已隐藏]');
    expect(`${historyHtml}${commandHtml}`).not.toContain('<script>');
    const incidentGate = createPendingActionGate(); incidentGate.begin();
    const disclosureGate = createPendingActionGate(); disclosureGate.begin();
    await expect(submitSecurityIncidentCommandOnce(incidentGate, { api: unavailableApi(), incident: incident.incident, draft: incidentAdjustDraft(), refresh: async () => {}, sessionExpired: () => {} })).resolves.toEqual({ status: 'submitting' });
    await expect(submitIndicatorDisclosureOnce(disclosureGate, { api: unavailableApi(), draft: disclosureDraft(), refresh: async () => {}, sessionExpired: () => {} })).resolves.toEqual({ status: 'submitting' });
    incidentGate.finish(); disclosureGate.finish();
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

function candidateAcceptOpenDraft() {
  return { decision: 'accept_and_open' as const, targetType: 'project' as const, targetId: candidateId, evidenceId, indicatorType: 'domain' as const, indicatorValue: 'unsafe.example', category: 'phishing' as const, resultingPosture: 'blocked' as const, resultingSeverity: 'high' as const, publicSummary: incident.incident.publicSummary, incidentId: '', expectedIncidentVersion: '', note: '' };
}
function candidateAcceptAttachDraft() {
  return { decision: 'accept_and_attach' as const, targetType: 'project' as const, targetId: candidateId, evidenceId, indicatorType: 'domain' as const, indicatorValue: 'unsafe.example', category: 'phishing' as const, resultingPosture: 'blocked' as const, resultingSeverity: 'high' as const, publicSummary: incident.incident.publicSummary, incidentId, expectedIncidentVersion: '3', note: '' };
}
function incidentAdjustDraft() {
  return { action: 'adjust' as const, evidenceId, reasonCode: 'evidence_escalated' as const, resultingPosture: 'blocked' as const, resultingSeverity: 'critical' as const, publicSummary: 'The verified phishing activity escalated in severity.', note: '' };
}
function disclosureDraft() {
  return { indicatorId, expectedIndicatorVersion: '2', decision: 'publish' as const, reasonCode: 'safe_for_public_warning' as const, note: '' };
}
function candidateReviewSuccess() { return { ok: true as const, data: { version: 1 as const, commandId: 'a1000000-0000-4000-8000-000000000010', candidateId, candidateVersion: 5, decisionId: 'a1000000-0000-4000-8000-000000000011', state: 'accepted' as const, indicatorId, incidentId, replayed: false }, nextCursor: null }; }
function incidentCommandSuccess() { return { ok: true as const, data: { version: 1 as const, commandId: 'a1000000-0000-4000-8000-000000000012', incidentId, incidentVersion: 4, decisionId: 'a1000000-0000-4000-8000-000000000013', state: 'active' as const, posture: 'blocked' as const, replayed: false }, nextCursor: null }; }
function disclosureSuccess() { return { ok: true as const, data: { version: 1 as const, commandId: 'a1000000-0000-4000-8000-000000000014', indicatorId, indicatorVersion: 3, decision: 'publish' as const, publicSafe: true, replayed: false }, nextCursor: null }; }
