import type {
  DecideDomainAuthorityCommandV1,
  DecideReferenceCommandV1,
  DomainAuthorityReviewListQuery,
  ReferenceReviewListQuery,
  RegisterReferenceCommandV1,
  ReviewerDomainAuthorityDetail,
  ReviewerDomainAuthorityListItem,
  ReviewerReferenceDetail,
  ReviewerReferenceListItem,
} from '@airdrop/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AuthorityDecisionForm,
  AuthorityDetail,
  buildAuthorityDecisionCommand,
  initialAuthorityDraft,
  isAuthorityDecisionConfirmed,
  submitAuthorityDecisionOnce,
} from '../components/reference/authority-detail.js';
import {
  applyAuthorityCursor,
  AuthorityList,
  authorityDetailHref,
  changeAuthorityFilters,
  loadAuthorityList,
} from '../components/reference/authority-list.js';
import {
  buildReferenceDecisionCommand,
  initialReferenceDraft,
  isReferenceDecisionConfirmed,
  ReferenceDecisionForm,
  ReferenceDetail,
  requiresReferenceEvidence,
  submitReferenceDecisionOnce,
} from '../components/reference/reference-detail.js';
import {
  applyReferenceCursor,
  buildReferenceRegisterCommand,
  changeReferenceFilters,
  loadReferenceList,
  referenceDetailHref,
  ReferenceList,
  ReferenceRegisterForm,
  submitReferenceRegisterOnce,
} from '../components/reference/reference-list.js';
import { createPendingActionGate } from '../lib/review-pending-action.js';
import type { ReferenceReviewApiClient } from '../lib/reference-review-api-client.js';

const projectId = 'c1000000-0000-4000-8000-000000000001';
const referenceId = 'c1000000-0000-4000-8000-000000000011';
const authorityId = 'c1000000-0000-4000-8000-000000000021';
const evidenceId = 'c1000000-0000-4000-8000-000000000031';
const decisionId = 'c1000000-0000-4000-8000-000000000041';
const updatedAt = '2026-08-30T04:00:00.000Z';

const authorityItem: ReviewerDomainAuthorityListItem = {
  authorityId, projectId, domain: 'example.com', state: 'candidate',
  version: 1, authorityVersion: 2, updatedAt,
};
const referenceItem: ReviewerReferenceListItem = {
  referenceId, projectId, kind: 'official_site', label: 'Official claim portal',
  url: 'https://example.com/claim', state: 'candidate', lastVerifiedAt: null,
  activeIndicatorId: null, version: 1, referenceVersion: 3, updatedAt,
};
const authorityDetailData: ReviewerDomainAuthorityDetail = {
  ...authorityItem,
  decisions: [{
    decisionId, decision: 'register', resultingState: 'candidate',
    reasonCode: 'insufficient_context', evidenceId, note: null, createdAt: updatedAt,
  }],
};
const referenceDetailData: ReviewerReferenceDetail = {
  ...referenceItem,
  domainAuthority: { authorityId, domain: 'example.com', state: 'granted', authorityVersion: 4 },
  decisions: [{
    decisionId, decision: 'register', resultingState: 'candidate',
    reasonCode: 'insufficient_context', evidenceId, note: null, createdAt: updatedAt,
  }],
};

const authorityQuery: DomainAuthorityReviewListQuery = {
  projectId, state: 'all', cursor: null, limit: 25,
};
const referenceQuery: ReferenceReviewListQuery = {
  projectId, state: 'all', cursor: null, limit: 25,
};

describe('reference review list components', () => {
  it('forms internal links only from validated UUIDs and leaves hostile identifiers inert', () => {
    expect(referenceDetailHref(referenceId)).toBe(`/review/references/${referenceId}`);
    expect(authorityDetailHref(authorityId)).toBe(`/review/references/authorities/${authorityId}`);

    for (const hostile of ['', 'not-a-uuid', '../admin', 'javascript:alert(1)', `${referenceId}'`]) {
      expect(referenceDetailHref(hostile), hostile).toBeNull();
      expect(authorityDetailHref(hostile), hostile).toBeNull();
    }

    const html = renderToStaticMarkup(createElement(ReferenceList, {
      state: { status: 'ready', items: [{ ...referenceItem, referenceId: 'not-a-uuid' }], nextCursor: null },
      query: referenceQuery,
    }));
    expect(html).not.toContain('/review/references/not-a-uuid');
    expect(html).toContain('[内容已隐藏]');
  });

  it('resets the cursor when filters change and preserves it only for next-page navigation', () => {
    expect(changeReferenceFilters({ ...referenceQuery, cursor: 'old' }, { state: 'verified' })).toEqual({
      projectId, state: 'verified', cursor: null, limit: 25,
    });
    expect(applyReferenceCursor(referenceQuery, 'next')).toMatchObject({ cursor: 'next' });
    expect(changeAuthorityFilters({ ...authorityQuery, cursor: 'old' }, { state: 'granted' })).toEqual({
      projectId, state: 'granted', cursor: null, limit: 25,
    });
    expect(applyAuthorityCursor(authorityQuery, 'next')).toMatchObject({ cursor: 'next' });
  });

  it('keeps hostile reference labels and URLs inert instead of rendering navigable markup', () => {
    const html = renderToStaticMarkup(createElement(ReferenceList, {
      state: {
        status: 'ready',
        items: [{
          ...referenceItem,
          label: '<script>alert(1)</script>',
          url: 'https://example.com/claim',
        }],
        nextCursor: null,
      },
      query: referenceQuery,
    }));

    expect(html).not.toContain('<script>');
    expect(html).toContain('[内容已隐藏]');
    expect(html).not.toContain('<a href="https://example.com/claim">');
    // React escapes text nodes, so escaping alone cannot prove the field was
    // withheld. The escaped form must be absent too.
    expect(html).not.toContain('&lt;script&gt;');
  });

  it('surfaces forbidden and failed list states without exposing an item table', () => {
    for (const status of ['forbidden', 'failed'] as const) {
      const html = renderToStaticMarkup(createElement(AuthorityList, {
        state: { status }, query: authorityQuery,
      }));
      expect(html, status).not.toContain('<table');
    }
    const loading = renderToStaticMarkup(createElement(ReferenceList, {
      state: { status: 'loading' }, query: referenceQuery,
    }));
    expect(loading).toContain('正在确认审核会话');
  });

  it('redirects to sign-in when the session has no access token', async () => {
    const redirected: string[] = [];
    const state = await loadReferenceList({
      session: { getAccessToken: async () => null } as never,
      api: unavailableApi(),
      query: referenceQuery,
      redirect: (path) => redirected.push(path),
    });

    expect(state).toEqual({ status: 'loading' });
    expect(redirected).toEqual(['/review/sign-in']);
    expect(
      await loadAuthorityList({
        session: { getAccessToken: async () => null } as never,
        api: unavailableApi(),
        query: authorityQuery,
        redirect: (path) => redirected.push(path),
      }),
    ).toEqual({ status: 'loading' });
  });

  it('builds a register command only from a complete https URL, label, and evidence', () => {
    expect(buildReferenceRegisterCommand({
      projectId, kind: 'official_site', url: 'https://example.com/claim',
      label: 'Official claim portal', evidenceId, note: '',
    })).toEqual({
      version: 1, projectId, kind: 'official_site', url: 'https://example.com/claim',
      label: 'Official claim portal', evidenceId, note: null,
    } satisfies RegisterReferenceCommandV1);

    for (const draft of [
      { projectId, kind: 'official_site' as const, url: 'https://example.com/claim', label: '', evidenceId, note: '' },
      { projectId, kind: 'official_site' as const, url: 'http://example.com/claim', label: 'Claim', evidenceId, note: '' },
      { projectId, kind: 'official_site' as const, url: 'https://example.com/claim#frag', label: 'Claim', evidenceId, note: '' },
      { projectId, kind: 'official_site' as const, url: 'https://example.com/claim', label: 'Claim', evidenceId: 'not-a-uuid', note: '' },
      { projectId: 'not-a-uuid', kind: 'official_site' as const, url: 'https://example.com/claim', label: 'Claim', evidenceId, note: '' },
    ]) {
      expect(buildReferenceRegisterCommand(draft), JSON.stringify(draft)).toBeNull();
    }
  });

  it('refuses to register an incomplete reference without any network call', async () => {
    const state = await submitReferenceRegisterOnce(createPendingActionGate(), {
      api: unavailableApi(),
      draft: { projectId, kind: 'official_site', url: '', label: '', evidenceId, note: '' },
      registered: async () => {},
      sessionExpired: () => {},
    });

    expect(state).toEqual({ status: 'failed', message: '请填写完整且有效的引用登记信息。' });
  });

  it('never auto-selects evidence in the register form', () => {
    const html = renderToStaticMarkup(createElement(ReferenceRegisterForm, {
      api: unavailableApi(), onRegistered: async () => {}, onSessionExpired: () => {},
    }));

    expect(html).toContain('证据 ID');
    expect(html).toContain('项目 ID');
    expect(html).toContain('URL');
  });
});

describe('reference review authority decisions', () => {
  it('binds every authority decision to the displayed authority version', () => {
    for (const decision of ['grant', 'revoke', 'regrant'] as const) {
      expect(
        buildAuthorityDecisionCommand(authorityDetailData, {
          decision, evidenceId: decision === 'revoke' ? '' : evidenceId,
          reasonCode: 'official_announcement', note: '',
        }),
        decision,
      ).toEqual({
        version: 1, authorityId, expectedVersion: 2, decision,
        reasonCode: 'official_announcement',
        evidenceId: decision === 'revoke' ? null : evidenceId,
        note: null,
      } satisfies DecideDomainAuthorityCommandV1);
    }
  });

  it('rejects grant and regrant without evidence at the command boundary', () => {
    for (const decision of ['grant', 'regrant'] as const) {
      expect(
        buildAuthorityDecisionCommand(authorityDetailData, {
          decision, evidenceId: '', reasonCode: 'official_announcement', note: '',
        }),
        decision,
      ).toBeNull();
    }
    expect(requiresReferenceEvidence('verify')).toBe(true);
    expect(requiresReferenceEvidence('reverify')).toBe(true);
    expect(requiresReferenceEvidence('restore')).toBe(true);
    expect(requiresReferenceEvidence('withdraw')).toBe(false);
  });

  it('requires an affirmative confirmation bound to the exact draft and authority version', () => {
    const draft = { decision: 'grant' as const, evidenceId, reasonCode: 'official_announcement' as const, note: '' };
    const snapshot = {
      affirmed: true, draft,
      authority: { authorityId, authorityVersion: 2 },
    };

    expect(isAuthorityDecisionConfirmed(authorityDetailData, draft, snapshot)).toBe(true);
    expect(isAuthorityDecisionConfirmed(authorityDetailData, draft, null)).toBe(false);
    expect(isAuthorityDecisionConfirmed(authorityDetailData, draft, { ...snapshot, affirmed: false })).toBe(false);
    expect(isAuthorityDecisionConfirmed(authorityDetailData, { ...draft, note: 'changed' }, snapshot)).toBe(false);
    expect(isAuthorityDecisionConfirmed(
      authorityDetailData, draft,
      { ...snapshot, authority: { authorityId, authorityVersion: 3 } },
    )).toBe(false);
  });

  it('submits once and clears the confirmation after a version conflict', async () => {
    let refreshCount = 0;
    const draft = { decision: 'grant' as const, evidenceId, reasonCode: 'official_announcement' as const, note: '' };
    const snapshot = { affirmed: true, draft, authority: { authorityId, authorityVersion: 2 } };
    const conflict = await submitAuthorityDecisionOnce(createPendingActionGate(), {
      api: conflictApi() as never,
      authority: authorityDetailData,
      draft,
      confirmation: snapshot,
      refresh: async () => { refreshCount += 1; },
      sessionExpired: () => {},
    });

    expect(conflict.status).toBe('conflict');
    expect(refreshCount).toBe(1);
  });

  it('refuses to submit an unconfirmed high-impact authority decision', async () => {
    const state = await submitAuthorityDecisionOnce(createPendingActionGate(), {
      api: unavailableApi(),
      authority: authorityDetailData,
      draft: { decision: 'grant', evidenceId, reasonCode: 'official_announcement', note: '' },
      confirmation: null,
      refresh: async () => {},
      sessionExpired: () => {},
    });

    expect(state).toEqual({ status: 'failed', message: '请在核对当前命令摘要后确认提交。' });
  });

  it('renders the authority detail with immutable decision history', () => {
    const html = renderToStaticMarkup(createElement(AuthorityDetail, { authority: authorityDetailData }));

    expect(html).toContain('example.com');
    expect(html).toContain('不可变更的权威历史');
    expect(html).toContain('v1 · register');
    expect(html).toContain(String(authorityId));
  });

  it('keeps a hostile domain and note inert in the authority detail', () => {
    const html = renderToStaticMarkup(createElement(AuthorityDetail, {
      authority: {
        ...authorityDetailData,
        domain: '<script>alert(1)</script>',
        decisions: [{
          decisionId, decision: 'register', resultingState: 'candidate',
          reasonCode: 'insufficient_context', evidenceId,
          note: '<a href="https://unsafe.example">click</a>', createdAt: updatedAt,
        }],
      },
    }));

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="https://unsafe.example">');
    expect(html).toContain('[内容已隐藏]');
    expect(html).not.toContain('&lt;script&gt;');
    expect(html).not.toContain('&lt;a href');
  });

  it('renders the authority decision form with an evidence field and no preselected evidence', () => {
    const html = renderToStaticMarkup(createElement(AuthorityDecisionForm, {
      api: unavailableApi(),
      authority: authorityDetailData,
      onRefresh: async () => {},
      onSessionExpired: () => {},
    }));

    expect(html).toContain('证据 ID');
    expect(html).toContain('grant');
    expect(html).toContain('revoke');
    expect(html).toContain('regrant');
    expect(initialAuthorityDraft(authorityDetailData).evidenceId).toBe('');
  });
});

describe('reference review reference decisions', () => {
  it('binds every reference decision to the displayed reference version', () => {
    for (const decision of ['verify', 'reverify', 'restore', 'withdraw'] as const) {
      expect(
        buildReferenceDecisionCommand(referenceDetailData, {
          decision, evidenceId: decision === 'withdraw' ? '' : evidenceId,
          reasonCode: decision === 'withdraw' ? 'withdrawn_by_reviewer' : 'evidence_verified', note: '',
        }),
        decision,
      ).toEqual({
        version: 1, referenceId, expectedVersion: 3, decision,
        reasonCode: decision === 'withdraw' ? 'withdrawn_by_reviewer' : 'evidence_verified',
        evidenceId: decision === 'withdraw' ? null : evidenceId,
        note: null,
      } satisfies DecideReferenceCommandV1);
    }
  });

  it('rejects verify, reverify, and restore without evidence', () => {
    for (const decision of ['verify', 'reverify', 'restore'] as const) {
      expect(
        buildReferenceDecisionCommand(referenceDetailData, {
          decision, evidenceId: '', reasonCode: 'evidence_verified', note: '',
        }),
        decision,
      ).toBeNull();
    }
  });

  it('requires an affirmative confirmation bound to the exact draft and reference version', () => {
    const draft = { decision: 'verify' as const, evidenceId, reasonCode: 'evidence_verified' as const, note: '' };
    const snapshot = { affirmed: true, draft, reference: { referenceId, referenceVersion: 3 } };

    expect(isReferenceDecisionConfirmed(referenceDetailData, draft, snapshot)).toBe(true);
    expect(isReferenceDecisionConfirmed(referenceDetailData, draft, null)).toBe(false);
    expect(isReferenceDecisionConfirmed(referenceDetailData, { ...draft, note: 'changed' }, snapshot)).toBe(false);
    expect(isReferenceDecisionConfirmed(
      referenceDetailData, draft,
      { ...snapshot, reference: { referenceId, referenceVersion: 4 } },
    )).toBe(false);
  });

  it('submits once, reports a version conflict, and reloads the newer state', async () => {
    let refreshCount = 0;
    const draft = { decision: 'verify' as const, evidenceId, reasonCode: 'evidence_verified' as const, note: '' };
    const state = await submitReferenceDecisionOnce(createPendingActionGate(), {
      api: conflictApi(),
      reference: referenceDetailData,
      draft,
      confirmation: { affirmed: true, draft, reference: { referenceId, referenceVersion: 3 } },
      refresh: async () => { refreshCount += 1; },
      sessionExpired: () => {},
    });

    expect(state.status).toBe('conflict');
    expect(refreshCount).toBe(1);
  });

  it('treats a forbidden result as a session expiry without reloading the detail', async () => {
    let expired = 0;
    const draft = { decision: 'withdraw' as const, evidenceId: '', reasonCode: 'withdrawn_by_reviewer' as const, note: '' };
    const state = await submitReferenceDecisionOnce(createPendingActionGate(), {
      api: forbiddenApi(),
      reference: referenceDetailData,
      draft,
      confirmation: { affirmed: true, draft, reference: { referenceId, referenceVersion: 3 } },
      refresh: async () => {},
      sessionExpired: () => { expired += 1; },
    });

    expect(state.status).toBe('forbidden');
    expect(expired).toBe(1);
  });

  it('refuses to submit an unconfirmed reference decision', async () => {
    const state = await submitReferenceDecisionOnce(createPendingActionGate(), {
      api: unavailableApi(),
      reference: referenceDetailData,
      draft: { decision: 'verify', evidenceId, reasonCode: 'evidence_verified', note: '' },
      confirmation: null,
      refresh: async () => {},
      sessionExpired: () => {},
    });

    expect(state).toEqual({ status: 'failed', message: '请在核对当前命令摘要后确认提交。' });
  });

  it('renders the reference detail with the granted domain authority context and immutable history', () => {
    const html = renderToStaticMarkup(createElement(ReferenceDetail, { reference: referenceDetailData }));

    expect(html).toContain('example.com');
    expect(html).toContain('granted');
    expect(html).toContain('不可变更的引用历史');
    expect(html).toContain('v1 · register');
  });

  it('keeps hostile labels, notes, and domain text inert in the reference detail', () => {
    const html = renderToStaticMarkup(createElement(ReferenceDetail, {
      reference: {
        ...referenceDetailData,
        label: '<script>alert(1)</script>',
        decisions: [{
          decisionId, decision: 'register', resultingState: 'candidate',
          reasonCode: 'insufficient_context', evidenceId,
          note: '<a href="https://unsafe.example">click</a>', createdAt: updatedAt,
        }],
      },
    }));

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<a href="https://unsafe.example">');
    expect(html).toContain('[内容已隐藏]');
    expect(html).not.toContain('&lt;script&gt;');
    expect(html).not.toContain('&lt;a href');
  });

  it('renders the reference decision form with all four decisions and no preselected evidence', () => {
    const html = renderToStaticMarkup(createElement(ReferenceDecisionForm, {
      api: unavailableApi(),
      reference: referenceDetailData,
      onRefresh: async () => {},
      onSessionExpired: () => {},
    }));

    for (const decision of ['verify', 'reverify', 'restore', 'withdraw']) expect(html).toContain(decision);
    expect(html).toContain('证据 ID');
    expect(initialReferenceDraft(referenceDetailData).evidenceId).toBe('');
  });
});

function unavailableApi(): ReferenceReviewApiClient {
  return {
    listReferences: async () => ({ ok: false, state: 'request_failed' }),
    listDomainAuthorities: async () => ({ ok: false, state: 'request_failed' }),
    getReference: async () => ({ ok: false, state: 'request_failed' }),
    getDomainAuthority: async () => ({ ok: false, state: 'request_failed' }),
    registerReference: async () => ({ ok: false, state: 'request_failed' }),
    registerDomainAuthority: async () => ({ ok: false, state: 'request_failed' }),
    decideReference: async () => ({ ok: false, state: 'request_failed' }),
    decideDomainAuthority: async () => ({ ok: false, state: 'request_failed' }),
  };
}

function conflictApi(): ReferenceReviewApiClient {
  return {
    ...unavailableApi(),
    decideReference: async () => ({ ok: false, state: 'conflict', code: 'reference_version_conflict' }),
    decideDomainAuthority: async () => ({ ok: false, state: 'conflict', code: 'reference_version_conflict' }),
  };
}

function forbiddenApi(): ReferenceReviewApiClient {
  return { ...unavailableApi(), decideReference: async () => ({ ok: false, state: 'forbidden' }) };
}
