import type {
  TutorialCandidateReviewDetail,
  TutorialReviewDetail,
} from '@airdrop/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AcceptCandidateForm,
  buildAcceptCommand,
  buildRejectCommand,
  CandidateDetail,
  initialStepDrafts,
  isAcceptConfirmed,
  parseStepLinks,
  RejectCandidateForm,
  submitAcceptOnce,
  submitRejectOnce,
} from '../components/tutorial/candidate-detail.js';
import {
  applyCandidateCursor,
  changeCandidateFilters,
  CandidateList,
  candidateDetailHref,
  loadCandidateList,
} from '../components/tutorial/candidate-list.js';
import {
  applyTutorialCursor,
  changeTutorialFilters,
  loadTutorialList,
  TutorialList,
} from '../components/tutorial/tutorial-list.js';
import {
  buildPublishCommand,
  buildRetireCommand,
  initialPublishDrafts,
  isPublishConfirmed,
  isRetireConfirmed,
  PublishVersionForm,
  RetireForm,
  submitPublishOnce,
  submitRetireOnce,
  TutorialDetail,
} from '../components/tutorial/tutorial-detail.js';
import { tutorialDetailHref } from '../components/tutorial/tutorial-links.js';
import { createPendingActionGate } from '../lib/review-pending-action.js';
import type { ReviewSessionController } from '../lib/review-session.js';
import type { TutorialReviewApiClient } from '../lib/tutorial-review-api-client.js';

const projectId = 'c4000000-0000-4000-8000-000000000001';
const candidateId = 'c4000000-0000-4000-8000-000000000002';
const tutorialId = 'c4000000-0000-4000-8000-000000000003';
const referenceId = 'c4000000-0000-4000-8000-000000000004';
const token = 'tutorial-ui-token';

const candidateItem = {
  candidateId,
  projectId,
  kind: 'airdrop_campaign' as const,
  status: 'pending' as const,
  title: '官方空投参与教程',
  createdAt: '2026-09-02T04:00:00.000Z',
};
const candidateDetail: TutorialCandidateReviewDetail = {
  ...candidateItem,
  summary: '覆盖从钱包连接到任务领取的完整步骤。',
  payload: {
    title: '官方空投参与教程',
    steps: [
      { title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
      { title: '打开领取页', body: '前往官方领取页查看任务。', links: [{ referenceId }] },
    ],
    sourceSignalIds: ['c4000000-0000-4000-8000-000000000005'],
    confidence: 80,
  },
  sourceSignalIds: ['c4000000-0000-4000-8000-000000000005'],
  confidence: 80,
};
const tutorialDetail: TutorialReviewDetail = {
  tutorialId,
  projectId,
  kind: 'airdrop_campaign',
  status: 'published',
  version: 1,
  title: '官方空投参与教程',
  summary: '覆盖从钱包连接到任务领取的完整步骤。',
  lastVerifiedAt: '2026-09-02T04:30:00.000Z',
  updatedAt: '2026-09-02T05:00:00.000Z',
  steps: [
    { ordinal: 1, title: '连接钱包', body: '在官方站点连接钱包并切换网络。', links: [] },
    {
      ordinal: 2,
      title: '打开领取页',
      body: '前往官方领取页查看任务。',
      links: [{
        referenceId,
        referenceLabel: '官方领取页',
        renderable: true,
        lastVerifiedAt: '2026-09-02T04:00:00.000Z',
      }],
    },
  ],
  decisions: [{
    decision: 'accept_candidate' as const,
    reasonCode: null,
    note: null,
    aggregateVersion: 1,
    createdAt: '2026-09-02T04:30:00.000Z',
  }],
  statusEvents: [{
    trigger: 'project_blocked' as const,
    fromStatus: 'published' as const,
    toStatus: 'blocked' as const,
    createdAt: '2026-09-02T05:00:00.000Z',
  }],
};

const editedSteps = [
  { title: '连接钱包（已核对）', body: '在官方站点连接钱包并切换网络。', links: '' },
  { title: '打开领取页（已核对）', body: '前往官方领取页查看任务。', links: referenceId },
];

function sessionStub(): ReviewSessionController {
  return { signIn: async () => ({ ok: true as const }), getAccessToken: async () => token, signOut: async () => {} };
}

function apiStub(
  receipt: Record<string, unknown>,
  calls: unknown[] = [],
): TutorialReviewApiClient {
  const respond = (value: Record<string, unknown>): unknown => value.ok === false
    ? value
    : { ok: true, data: value, nextCursor: null };
  return {
    listCandidates: async (query) => { calls.push(query); return { ok: true, data: { version: 1, items: [candidateItem] }, nextCursor: null }; },
    getCandidate: async () => { calls.push('getCandidate'); return { ok: true, data: candidateDetail, nextCursor: null }; },
    listTutorials: async (query) => { calls.push(query); return { ok: true, data: { version: 1, items: [] }, nextCursor: null }; },
    getTutorial: async () => { calls.push('getTutorial'); return { ok: true, data: tutorialDetail, nextCursor: null }; },
    acceptCandidate: async (command) => { calls.push(command); return respond(receipt) as never; },
    rejectCandidate: async (command) => { calls.push(command); return respond(receipt) as never; },
    publishVersion: async (id, command) => { calls.push([id, command]); return respond(receipt) as never; },
    retire: async (id, command) => { calls.push([id, command]); return respond(receipt) as never; },
  };
}

const acceptReceipt = {
  version: 1,
  commandId: 'c4000000-0000-4000-8000-000000000006',
  candidateId,
  tutorialId,
  tutorialVersion: 1,
  replayed: false,
};
const rejectReceipt = {
  version: 1,
  commandId: 'c4000000-0000-4000-8000-000000000006',
  candidateId,
  replayed: false,
};
const publishReceipt = {
  version: 1,
  commandId: 'c4000000-0000-4000-8000-000000000006',
  tutorialId,
  tutorialVersion: 2,
  replayed: false,
};
const retireReceipt = {
  version: 1,
  commandId: 'c4000000-0000-4000-8000-000000000006',
  tutorialId,
  replayed: false,
};

describe('tutorial review UI components', () => {
  it('renders the candidate list with filters and pagination plumbing', () => {
    const markup = renderToStaticMarkup(createElement(CandidateList, {
      state: { status: 'ready' as const, items: [candidateItem], nextCursor: 'tok' },
      query: { status: 'pending' as const, cursor: null, limit: 25 },
    }));
    expect(markup).toContain('教程候选队列');
    expect(markup).toContain('官方空投参与教程');
    expect(markup).toContain('下一页');
    expect(changeCandidateFilters({ status: 'pending', cursor: 'tok', limit: 25 }, { status: 'all' }))
      .toEqual({ status: 'all', cursor: null, limit: 25 });
    expect(applyCandidateCursor({ status: 'pending', cursor: null, limit: 25 }, 'tok').cursor).toBe('tok');
    expect(candidateDetailHref(candidateId)).toBe(`/review/tutorials/candidates/${candidateId}`);
    expect(candidateDetailHref('not-a-uuid')).toBeNull();
  });

  it('renders hostile candidate text inertly without executable markup', () => {
    const hostile = { ...candidateItem, title: '<script>alert(1)</script>' };
    const markup = renderToStaticMarkup(createElement(CandidateList, {
      state: { status: 'ready' as const, items: [hostile], nextCursor: null },
      query: { status: 'pending' as const, cursor: null, limit: 25 },
    }));
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('内容已隐藏');
  });

  it('renders the candidate detail with the payload hidden as inert data', () => {
    const markup = renderToStaticMarkup(createElement(CandidateDetail, { candidate: candidateDetail }));
    expect(markup).toContain('原始候选载荷');
    expect(markup).not.toContain(referenceId);
  });

  it('seeds editable steps from the candidate payload and builds a valid accept command', () => {
    const drafts = initialStepDrafts(candidateDetail);
    expect(drafts).toHaveLength(2);
    expect(drafts[1]?.links).toBe(referenceId);
    const command = buildAcceptCommand(candidateDetail, drafts);
    expect(command).toMatchObject({
      version: 1,
      candidateId,
      expectedCandidateVersion: 1,
    });
    expect(command?.steps[1]?.links).toEqual([{ referenceId }]);
    expect(parseStepLinks(`  ${referenceId}\n\nnot-a-uuid  `)).toEqual([
      { referenceId },
      { referenceId: 'not-a-uuid' },
    ]);
  });

  it('rejects accept commands with url-bearing step text or missing steps', () => {
    const command = buildAcceptCommand(candidateDetail, [
      { title: '连接钱包 https://x.example', body: '在官方站点连接钱包并切换网络。', links: '' },
      { title: '打开领取页', body: '前往官方领取页查看任务。', links: referenceId },
    ]);
    expect(command).toBeNull();
    expect(buildAcceptCommand(candidateDetail, [editedSteps[0]!])).toBeNull();
  });

  it('binds the accept confirmation to the candidate id and expected version', () => {
    const confirmation = {
      affirmed: true,
      steps: editedSteps,
      candidate: { candidateId, expectedCandidateVersion: 1 },
    };
    expect(isAcceptConfirmed(candidateDetail, editedSteps, confirmation)).toBe(true);
    expect(isAcceptConfirmed(candidateDetail, [editedSteps[0]!, editedSteps[1]!], {
      ...confirmation,
      candidate: { candidateId, expectedCandidateVersion: 2 },
    })).toBe(false);
    expect(isAcceptConfirmed(candidateDetail, [{ ...editedSteps[0]!, title: 'changed' }, editedSteps[1]!], confirmation)).toBe(false);
    expect(isAcceptConfirmed(candidateDetail, editedSteps, null)).toBe(false);
  });

  it('submits accept once and clears the confirmation on conflict', async () => {
    const calls: unknown[] = [];
    const ok = await submitAcceptOnce(createPendingActionGate(), {
      api: apiStub(acceptReceipt, calls),
      candidate: candidateDetail,
      steps: editedSteps,
      confirmation: {
        affirmed: true,
        steps: editedSteps,
        candidate: { candidateId, expectedCandidateVersion: 1 },
      },
      refresh: async () => {},
      sessionExpired: async () => {},
    });
    expect(ok.status).toBe('saved');
    expect(calls).toHaveLength(1);

    const conflictCalls: unknown[] = [];
    const conflict = await submitAcceptOnce(createPendingActionGate(), {
      api: apiStub({ ok: false, state: 'conflict', code: 'tutorial_version_conflict' }, conflictCalls),
      candidate: candidateDetail,
      steps: editedSteps,
      confirmation: {
        affirmed: true,
        steps: editedSteps,
        candidate: { candidateId, expectedCandidateVersion: 1 },
      },
      refresh: async () => {},
      sessionExpired: async () => {},
    });
    expect(conflict.status).toBe('conflict');
    expect(conflictCalls).toHaveLength(1);

    const unconfirmed = await submitAcceptOnce(createPendingActionGate(), {
      api: apiStub(acceptReceipt, []),
      candidate: candidateDetail,
      steps: editedSteps,
      confirmation: null,
      refresh: async () => {},
      sessionExpired: async () => {},
    });
    expect(unconfirmed.status).toBe('failed');
  });

  it('builds a valid reject command and submits it once', async () => {
    const draft = { reasonCode: 'duplicate' as const, note: ' 重复候选 ' };
    const command = buildRejectCommand(candidateDetail, draft);
    expect(command).toEqual({
      version: 1,
      candidateId,
      expectedCandidateVersion: 1,
      reasonCode: 'duplicate',
      note: '重复候选',
    });
    const calls: unknown[] = [];
    const result = await submitRejectOnce(createPendingActionGate(), {
      api: apiStub(rejectReceipt, calls),
      candidate: candidateDetail,
      draft,
      confirmation: {
        affirmed: true,
        draft,
        candidate: { candidateId, expectedCandidateVersion: 1 },
      },
      refresh: async () => {},
      sessionExpired: async () => {},
    });
    expect(result.status).toBe('saved');
    expect(calls).toHaveLength(1);
  });

  it('renders the tutorial list with the status filter and detail links', () => {
    const markup = renderToStaticMarkup(createElement(TutorialList, {
      state: { status: 'ready' as const, items: [tutorialDetail], nextCursor: null },
      query: { status: 'all' as const, cursor: null, limit: 25 },
    }));
    expect(markup).toContain('教程台账');
    expect(markup).toContain('v1');
    expect(changeTutorialFilters({ status: 'all', cursor: 'tok', limit: 25 }, { status: 'blocked' }))
      .toEqual({ status: 'blocked', cursor: null, limit: 25 });
    expect(applyTutorialCursor({ status: 'all', cursor: null, limit: 25 }, 'tok').cursor).toBe('tok');
    expect(tutorialDetailHref(tutorialId)).toBe(`/review/tutorials/${tutorialId}`);
    expect(tutorialDetailHref('nope')).toBeNull();
  });

  it('renders decision history and status events as timelines', () => {
    const markup = renderToStaticMarkup(createElement(TutorialDetail, { tutorial: tutorialDetail }));
    expect(markup).toContain('决策历史');
    expect(markup).toContain('accept_candidate');
    expect(markup).toContain('状态事件时间线');
    expect(markup).toContain('project_blocked');
    expect(markup).toContain('published → blocked');
  });

  it('seeds publish drafts from the current version and validates the command', () => {
    const drafts = initialPublishDrafts(tutorialDetail);
    expect(drafts[1]?.links).toBe(referenceId);
    const command = buildPublishCommand(tutorialDetail, drafts);
    expect(command).toMatchObject({ version: 1, tutorialId, expectedVersion: 1 });
    expect(isPublishConfirmed(tutorialDetail, drafts, {
      affirmed: true,
      steps: drafts,
      tutorial: { tutorialId, expectedVersion: 1 },
    })).toBe(true);
    expect(isPublishConfirmed(tutorialDetail, drafts, {
      affirmed: true,
      steps: drafts,
      tutorial: { tutorialId, expectedVersion: 2 },
    })).toBe(false);
  });

  it('maps publish conflicts onto a refresh and cleared confirmation', async () => {
    const conflictCalls: unknown[] = [];
    const result = await submitPublishOnce(createPendingActionGate(), {
      api: apiStub({ ok: false, state: 'conflict', code: 'tutorial_idempotency_conflict' }, conflictCalls),
      tutorial: tutorialDetail,
      steps: initialPublishDrafts(tutorialDetail),
      confirmation: {
        affirmed: true,
        steps: initialPublishDrafts(tutorialDetail),
        tutorial: { tutorialId, expectedVersion: 1 },
      },
      refresh: async () => {},
      sessionExpired: async () => {},
    });
    expect(result.status).toBe('conflict');
    expect(conflictCalls).toHaveLength(1);
  });

  it('builds the retire command and binds its confirmation to the current version', async () => {
    const draft = { reasonCode: 'security_blocked' as const, note: '' };
    const command = buildRetireCommand(tutorialDetail, draft);
    expect(command).toEqual({
      version: 1,
      tutorialId,
      expectedVersion: 1,
      reasonCode: 'security_blocked',
      note: null,
    });
    expect(isRetireConfirmed(tutorialDetail, draft, {
      affirmed: true,
      draft,
      tutorial: { tutorialId, expectedVersion: 1 },
    })).toBe(true);
    expect(isRetireConfirmed(tutorialDetail, draft, {
      affirmed: true,
      draft,
      tutorial: { tutorialId, expectedVersion: 2 },
    })).toBe(false);

    const calls: unknown[] = [];
    const result = await submitRetireOnce(createPendingActionGate(), {
      api: apiStub(retireReceipt, calls),
      tutorial: tutorialDetail,
      draft,
      confirmation: { affirmed: true, draft, tutorial: { tutorialId, expectedVersion: 1 } },
      refresh: async () => {},
      sessionExpired: async () => {},
    });
    expect(result.status).toBe('saved');
    expect(calls).toHaveLength(1);
  });

  it('redirects anonymous list loads to the sign-in page', async () => {
    let redirected = '';
    const state = await loadCandidateList({
      session: { signIn: async () => ({ ok: true as const }), getAccessToken: async () => null, signOut: async () => {} },
      api: apiStub(acceptReceipt),
      query: { status: 'pending', cursor: null, limit: 25 },
      redirect: (path) => { redirected = path; },
    });
    expect(redirected).toBe('/review/sign-in');
    expect(state.status).toBe('loading');
  });

  it('loads the tutorial list through the api client', async () => {
    const state = await loadTutorialList({
      session: sessionStub(),
      api: apiStub(retireReceipt),
      query: { status: 'all', cursor: null, limit: 25 },
      redirect: () => {},
    });
    expect(state.status).toBe('ready');
  });

  it('renders the accept and reject forms with confirmation checkboxes', () => {
    const accept = renderToStaticMarkup(createElement(AcceptCandidateForm, {
      api: apiStub(acceptReceipt),
      candidate: candidateDetail,
      onRefresh: async () => {},
      onSessionExpired: async () => {},
    }));
    expect(accept).toContain('批准并发布教程');
    expect(accept).toContain('我已核对以上命令摘要');
    const reject = renderToStaticMarkup(createElement(RejectCandidateForm, {
      api: apiStub(rejectReceipt),
      candidate: candidateDetail,
      onRefresh: async () => {},
      onSessionExpired: async () => {},
    }));
    expect(reject).toContain('拒绝候选');
  });

  it('renders the publish and retire forms', () => {
    const publish = renderToStaticMarkup(createElement(PublishVersionForm, {
      api: apiStub(publishReceipt),
      tutorial: tutorialDetail,
      onRefresh: async () => {},
      onSessionExpired: async () => {},
    }));
    expect(publish).toContain('发布新版本');
    const retire = renderToStaticMarkup(createElement(RetireForm, {
      api: apiStub(retireReceipt),
      tutorial: tutorialDetail,
      onRefresh: async () => {},
      onSessionExpired: async () => {},
    }));
    expect(retire).toContain('下线教程');
  });
});
