import type {
  FailedAiRunDecisionCommand,
  FailedAiRunDetail as FailedAiRunDetailDto,
  FailedAiRunListItem,
  FailedAiRunListQuery,
} from '@airdrop/contracts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PublicShellBoundary } from '../components/app-shell.js';
import {
  FailedAiRunDecisionForm,
  changeFailedAiRunDecision,
  failedAiRunReasonsFor,
  normalizeReviewNoteInput,
  submitFailedAiRunDecision,
  submitFailedAiRunDecisionOnce,
} from '../components/review/failed-ai-run-decision-form.js';
import {
  FailedAiRunDetail,
  loadFailedAiRunDetail,
} from '../components/review/failed-ai-run-detail.js';
import {
  FailedAiRunList,
  applyFailedAiRunCursor,
  changeFailedAiRunFilters,
  loadFailedAiRunList,
} from '../components/review/failed-ai-run-list.js';
import {
  SignInForm,
  submitReviewSignIn,
} from '../components/review/sign-in-form.js';
import {
  ReviewShell,
  runReviewSignOutOnce,
  signOutAndRedirect,
} from '../app/review/review-shell.js';
import type {
  ReviewApiClient,
  ReviewApiFailure,
  ReviewApiSuccess,
} from '../lib/review-api-client.js';
import type { ReviewSessionController } from '../lib/review-session.js';
import { createPendingActionGate } from '../lib/review-pending-action.js';

const runId = 'a1000000-0000-4000-8000-000000000001';
const inputId = 'a4000000-0000-4000-8000-000000000001';
const decisionId = 'a5000000-0000-4000-8000-000000000001';
const reviewerUserId = 'a6000000-0000-4000-8000-000000000001';

const run: FailedAiRunListItem = {
  version: 1,
  runId,
  status: 'provider_error',
  safeFailureCode: 'provider_error',
  stage: 'extract_discovered_item',
  inputKind: 'discovered_item',
  modelId: 'review-test-model',
  promptVersion: 'extract-v1',
  schemaVersion: 'candidate-v1',
  pipelineVersion: 'pipeline-v1',
  project: null,
  source: null,
  createdAt: '2026-08-22T00:00:00.000Z',
  reviewState: 'unreviewed',
  reviewVersion: 0,
  latestDecisionAt: null,
};

const detail: FailedAiRunDetailDto = {
  version: 1,
  run,
  input: { kind: 'discovered_item', id: inputId, collectedAt: null },
  decisions: [],
};

const allQuery: FailedAiRunListQuery = {
  reviewState: 'all',
  status: 'all',
  cursor: null,
  limit: 25,
};

describe('review shell and authentication', () => {
  it('keeps every review path outside the public application shell', () => {
    const reviewHtml = renderToStaticMarkup(createElement(PublicShellBoundary, {
      pathname: '/review/sign-in',
      children: createElement(ReviewShell, null, '审核内容'),
    }));
    const publicHtml = renderToStaticMarkup(createElement(PublicShellBoundary, {
      pathname: '/opportunities',
      children: '公开内容',
    }));

    expect(reviewHtml).toContain('审核内容');
    expect(reviewHtml).toContain('AI Run 审核');
    expect(reviewHtml).not.toMatch(/工作台|机会列表|已连接远程数据源/);
    expect(publicHtml).toMatch(/工作台|机会列表|已连接远程数据源/);
  });

  it('renders accessible credentials and a generic error without account-management links', () => {
    const html = renderToStaticMarkup(createElement(SignInForm, {
      session: session(),
      onSignedIn: () => undefined,
      initialState: { status: 'error' },
    }));

    expect(html).toMatch(/<label[^>]*for="review-email"[^>]*>邮箱/);
    expect(html).toMatch(/<input[^>]*id="review-email"[^>]*type="email"/);
    expect(html).toMatch(/<label[^>]*for="review-password"[^>]*>密码/);
    expect(html).toMatch(/<input[^>]*id="review-password"[^>]*type="password"/);
    expect(html).toContain('登录失败，请检查凭据后重试。');
    expect(html).not.toMatch(/注册|重置|忘记密码|角色管理/);
    expect(html).not.toMatch(/<a\b/i);
  });

  it('redirects after a successful sign-in and returns only a bounded failure otherwise', async () => {
    const destinations: string[] = [];
    const success = await submitReviewSignIn({
      session: session(),
      email: 'reviewer@example.test',
      password: 'password',
      redirect: (path) => destinations.push(path),
    });
    const failure = await submitReviewSignIn({
      session: session({ signIn: async () => ({ ok: false, code: 'sign_in_failed' }) }),
      email: 'reviewer@example.test',
      password: 'provider password=secret',
      redirect: (path) => destinations.push(path),
    });

    expect(success).toEqual({ status: 'idle' });
    expect(destinations).toEqual(['/review/ai-runs']);
    expect(failure).toEqual({ status: 'error' });
    expect(JSON.stringify(failure)).not.toMatch(/provider|password|secret/i);
  });

  it('clears the session before returning to sign-in', async () => {
    const events: string[] = [];
    await signOutAndRedirect(
      session({ signOut: async () => { events.push('signed-out'); } }),
      (path) => events.push(path),
    );

    expect(events).toEqual(['signed-out', '/review/sign-in']);
  });

  it('hides sign-out before runtime readiness and disables repeat action while pending', async () => {
    const unavailable = renderToStaticMarkup(createElement(ReviewShell, null, '审核内容'));
    const pending = renderToStaticMarkup(createElement(ReviewShell, {
      onSignOut: async () => undefined,
      signOutPending: true,
      children: '审核内容',
    }));
    expect(unavailable).not.toContain('退出登录');
    expect(pending).toMatch(/<button[^>]*disabled=""[^>]*>正在退出…/);
    expect(pending).toContain('正在安全退出…');

    let releases: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => { releases = resolve; });
    let calls = 0;
    const pendingTransitions: boolean[] = [];
    const gate = createPendingActionGate();
    const first = runReviewSignOutOnce(gate, async () => {
      calls += 1;
      await waiting;
    }, (pendingState) => pendingTransitions.push(pendingState));
    const second = await runReviewSignOutOnce(
      gate,
      async () => { calls += 1; },
      (pendingState) => pendingTransitions.push(pendingState),
    );
    expect(second).toBe(false);
    expect(calls).toBe(1);
    expect(pendingTransitions).toEqual([true]);
    releases?.();
    await expect(first).resolves.toBe(true);
    expect(pendingTransitions).toEqual([true, false]);
  });
});

describe('failed AI run list', () => {
  it('renders a neutral loading state, explicit empty and bounded failure states', () => {
    expect(renderToStaticMarkup(createElement(FailedAiRunList, {
      state: { status: 'loading' }, query: allQuery,
    }))).toContain('正在确认审核会话…');
    expect(renderToStaticMarkup(createElement(FailedAiRunList, {
      state: { status: 'ready', items: [], nextCursor: null }, query: allQuery,
    }))).toContain('没有匹配的失败 AI run。');
    expect(renderToStaticMarkup(createElement(FailedAiRunList, {
      state: { status: 'forbidden' }, query: allQuery,
    }))).toContain('当前账号没有有效的审核权限。');
    const failed = renderToStaticMarkup(createElement(FailedAiRunList, {
      state: { status: 'failed' }, query: allQuery,
    }));
    expect(failed).toContain('审核列表暂时无法加载。');
    expect(failed).not.toMatch(/password|secret|postgres|raw|https?:\/\//i);
  });

  it('offers every documented filter and a cursor next action', () => {
    const html = renderToStaticMarkup(createElement(FailedAiRunList, {
      state: { status: 'ready', items: [run], nextCursor: 'next-cursor' },
      query: allQuery,
      onQueryChange: () => undefined,
      onNext: () => undefined,
    }));

    for (const option of [
      '全部审核状态', '未审核', '需要调查', '已忽略',
      '全部失败状态', 'provider_error', 'schema_invalid_after_repair', 'grounding_failed',
    ]) expect(html).toContain(option);
    expect(html).toContain('2026-08-22 00:00 UTC');
    expect(html).toContain('下一页');
  });

  it('resets the cursor on each filter change and applies only the selected next cursor', () => {
    const current: FailedAiRunListQuery = {
      reviewState: 'unreviewed',
      status: 'provider_error',
      cursor: 'old-cursor',
      limit: 25,
    };

    expect(changeFailedAiRunFilters(current, { reviewState: 'dismissed' })).toEqual({
      reviewState: 'dismissed', status: 'provider_error', cursor: null, limit: 25,
    });
    expect(changeFailedAiRunFilters(current, { status: 'grounding_failed' })).toEqual({
      reviewState: 'unreviewed', status: 'grounding_failed', cursor: null, limit: 25,
    });
    expect(applyFailedAiRunCursor(current, 'selected-next-cursor')).toEqual({
      reviewState: 'unreviewed', status: 'provider_error',
      cursor: 'selected-next-cursor', limit: 25,
    });
  });

  it('redirects an expired session and maps bounded API states without rendering data', async () => {
    const destinations: string[] = [];
    let listCalls = 0;
    const expired = await loadFailedAiRunList({
      session: session({ getAccessToken: async () => null }),
      api: api({ list: async () => { listCalls += 1; return okList([run]); } }),
      query: allQuery,
      redirect: (path) => destinations.push(path),
    });
    const forbidden = await loadFailedAiRunList({
      session: session(),
      api: api({ list: async () => failure('forbidden') }),
      query: allQuery,
      redirect: (path) => destinations.push(path),
    });
    const failed = await loadFailedAiRunList({
      session: session(),
      api: api({ list: async () => failure('request_failed') }),
      query: allQuery,
      redirect: (path) => destinations.push(path),
    });

    expect(expired).toEqual({ status: 'loading' });
    expect(destinations).toEqual(['/review/sign-in']);
    expect(listCalls).toBe(0);
    expect(forbidden).toEqual({ status: 'forbidden' });
    expect(failed).toEqual({ status: 'failed' });
  });
});

describe('failed AI run detail and immutable history', () => {
  it('renders enumerated safe metadata but never renders unsafe object fields or URLs', () => {
    const mutated = {
      ...detail,
      run: {
        ...detail.run,
        errorDetail: 'UNSAFE_ERROR_DETAIL password=secret https://unsafe.example',
        output: { raw_text: 'UNSAFE_RAW_OUTPUT' },
        usage: { prompt_tokens: 99 },
        sourceBody: 'UNSAFE_SOURCE_BODY',
        credentials: 'UNSAFE_CREDENTIALS',
      },
      providerResponse: 'UNSAFE_PROVIDER_RESPONSE',
    } as unknown as FailedAiRunDetailDto;
    const html = renderToStaticMarkup(createElement(FailedAiRunDetail, { detail: mutated }));

    expect(html).toContain('provider_error');
    expect(html).toContain('pipeline-v1');
    expect(html).toContain(runId);
    expect(html).not.toMatch(/UNSAFE_|password|raw_text|error_detail|https?:\/\//i);
  });

  it('renders bounded raw_item enums without treating them as free-form raw payloads', () => {
    const rawItemDetail: FailedAiRunDetailDto = {
      ...detail,
      run: { ...detail.run, inputKind: 'raw_item' },
      input: { ...detail.input, kind: 'raw_item' },
    };
    const html = renderToStaticMarkup(createElement(FailedAiRunDetail, {
      detail: rawItemDetail,
    }));
    expect(html.match(/raw_item/g)).toHaveLength(2);
  });

  it('uses one conservative policy for secrets in notes and otherwise allowed string fields', () => {
    const unsafeFragments = [
      's3cr3t', 'db.internal', 'reviewer', 'top-secret-fragment',
      'forbidden-output-fragment', 'forbidden-token-fragment', 'operator@example.test',
      'forbidden-seed-fragment', 'reviewer-secret-fragment',
      'machine-payload-fragment', 'opaque-secret-fragment',
    ];
    const unsafeDetail = {
      ...detail,
      run: {
        ...detail.run,
        stage: 'postgresql://reviewer:s3cr3t@db.internal/review',
        modelId: 'api_key=top-secret-fragment',
        promptVersion: '{"provider":"raw","output":"forbidden-output-fragment"}',
        schemaVersion: 'seed=forbidden-seed-fragment',
        pipelineVersion: 'Bearer forbidden-token-fragment',
        project: {
          id: 'a8000000-0000-4000-8000-000000000001',
          slug: 'unsafe-project',
          name: 'mailto:operator@example.test',
        },
        source: {
          id: 'a8000000-0000-4000-8000-000000000002',
          name: 'line one\nraw machine-payload-fragment',
          sourceType: 'official',
        },
      },
      decisions: [{
        version: 1,
        decisionId,
        reviewVersion: 1,
        decision: 'needs_investigation',
        reasonCode: 'other',
        note: `data:text/plain,provider raw output ${'opaque-secret-fragment'.repeat(5)}`,
        reviewerUserId: 'private_key=reviewer-secret-fragment',
        createdAt: '2026-08-22T01:00:00.000Z',
      }],
    } as FailedAiRunDetailDto;

    const html = renderToStaticMarkup(createElement(FailedAiRunDetail, { detail: unsafeDetail }));
    expect(html).toContain('[内容已隐藏]');
    for (const fragment of unsafeFragments) expect(html).not.toContain(fragment);
    expect(html).not.toMatch(/postgresql:|mailto:|data:|api_key=|Bearer /i);
  });

  it('hides JWT-shaped values independently in notes and allowed metadata', () => {
    const noteJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsYSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const metadataJwt = 'YWJjZGVmZ2hpamts.bW5vcHFyc3R1dnd4.eXoxMjM0NTY3ODkwQUJD';
    const jwtDetail: FailedAiRunDetailDto = {
      ...detail,
      run: { ...detail.run, modelId: metadataJwt },
      decisions: [{
        version: 1,
        decisionId,
        reviewVersion: 1,
        decision: 'needs_investigation',
        reasonCode: 'other',
        note: noteJwt,
        reviewerUserId,
        createdAt: '2026-08-22T01:00:00.000Z',
      }],
    };

    const html = renderToStaticMarkup(createElement(FailedAiRunDetail, { detail: jwtDetail }));
    expect(html.match(/\[内容已隐藏\]/g)).toHaveLength(2);
    expect(html).not.toContain('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    expect(html).not.toContain('eXoxMjM0NTY3ODkwQUJD');
  });

  it('hides short mixed-class machine tokens independently in notes and allowed metadata', () => {
    const noteMachineToken = 'A7fK2_mQ9xL4pR8vT3nW6cY1';
    const metadataMachineToken = 'Q9vT3-xL7mN2pR8cW4yK6aD1zF5';
    const machineTokenDetail: FailedAiRunDetailDto = {
      ...detail,
      run: { ...detail.run, pipelineVersion: metadataMachineToken },
      decisions: [{
        version: 1,
        decisionId,
        reviewVersion: 1,
        decision: 'needs_investigation',
        reasonCode: 'other',
        note: noteMachineToken,
        reviewerUserId,
        createdAt: '2026-08-22T01:00:00.000Z',
      }],
    };

    const html = renderToStaticMarkup(createElement(FailedAiRunDetail, {
      detail: machineTokenDetail,
    }));
    expect(html.match(/\[内容已隐藏\]/g)).toHaveLength(2);
    expect(html).not.toContain('A7fK2_mQ9xL4pR8vT3nW6cY1');
    expect(html).not.toContain('Q9vT3-xL7mN2pR8cW4yK6aD1zF5');
  });

  it('keeps UUIDs, bounded enums, ordinary text, and natural identifiers visible', () => {
    const safeDetail: FailedAiRunDetailDto = {
      ...detail,
      run: {
        ...detail.run,
        modelId: 'Claude-3-Opus-2026',
        project: {
          id: 'a8000000-0000-4000-8000-000000000001',
          slug: 'project-release',
          name: 'Project-Release-2026-Alpha',
        },
        source: {
          id: 'a8000000-0000-4000-8000-000000000002',
          name: 'Community research digest',
          sourceType: 'official',
        },
      },
      decisions: [{
        version: 1,
        decisionId,
        reviewVersion: 1,
        decision: 'needs_investigation',
        reasonCode: 'other',
        note: 'Checked the evidence and timing; manual follow-up is needed.',
        reviewerUserId,
        createdAt: '2026-08-22T01:00:00.000Z',
      }],
    };

    const html = renderToStaticMarkup(createElement(FailedAiRunDetail, { detail: safeDetail }));
    for (const value of [
      runId,
      inputId,
      'provider_error',
      'Claude-3-Opus-2026',
      'Project-Release-2026-Alpha',
      'Community research digest',
      'Checked the evidence and timing; manual follow-up is needed.',
    ]) expect(html).toContain(value);
  });

  it('uses stable failure explanations and renders history by review version despite reversed or equal timestamps', () => {
    const withHistory: FailedAiRunDetailDto = {
      ...detail,
      decisions: [
        {
          version: 1,
          decisionId: 'a5000000-0000-4000-8000-000000000002',
          reviewVersion: 2,
          decision: 'dismiss',
          reasonCode: 'no_action_needed',
          note: 'second-note',
          reviewerUserId,
          createdAt: '2026-08-22T00:00:00.000Z',
        },
        {
          version: 1,
          decisionId,
          reviewVersion: 1,
          decision: 'needs_investigation',
          reasonCode: 'provider_instability',
          note: 'first-note',
          reviewerUserId,
          createdAt: '2026-08-22T02:00:00.000Z',
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(FailedAiRunDetail, { detail: withHistory }));

    expect(html).toContain('AI 服务暂时未完成该阶段。');
    expect(html.indexOf('first-note')).toBeLessThan(html.indexOf('second-note'));
    expect(html).not.toMatch(/<input\b|<select\b|<textarea\b|contenteditable|<button\b/i);

    const equalTimestamps = {
      ...withHistory,
      decisions: withHistory.decisions.map((record) => ({
        ...record,
        createdAt: '2026-08-22T01:00:00.000Z',
      })).reverse(),
    };
    const equalHtml = renderToStaticMarkup(createElement(FailedAiRunDetail, {
      detail: equalTimestamps,
    }));
    expect(equalHtml.indexOf('first-note')).toBeLessThan(equalHtml.indexOf('second-note'));
  });

  it('redirects expired detail sessions and preserves bounded forbidden/not-found states', async () => {
    const destinations: string[] = [];
    let getCalls = 0;
    const expired = await loadFailedAiRunDetail({
      session: session({ getAccessToken: async () => null }),
      api: api({ get: async () => { getCalls += 1; return okDetail(detail); } }),
      runId,
      redirect: (path) => destinations.push(path),
    });
    const forbidden = await loadFailedAiRunDetail({
      session: session(), api: api({ get: async () => failure('forbidden') }), runId,
      redirect: (path) => destinations.push(path),
    });
    const missing = await loadFailedAiRunDetail({
      session: session(), api: api({ get: async () => failure('not_found') }), runId,
      redirect: (path) => destinations.push(path),
    });

    expect(expired).toEqual({ status: 'loading' });
    expect(destinations).toEqual(['/review/sign-in']);
    expect(getCalls).toBe(0);
    expect(forbidden).toEqual({ status: 'forbidden' });
    expect(missing).toEqual({ status: 'not_found' });
  });
});

describe('failed AI run decision submission', () => {
  it('offers only the exact reasons compatible with the selected decision', () => {
    expect(failedAiRunReasonsFor('needs_investigation')).toEqual([
      'provider_instability', 'schema_regression', 'grounding_regression',
      'source_data_problem', 'suspected_prompt_injection', 'other',
    ]);
    expect(failedAiRunReasonsFor('dismiss')).toEqual([
      'transient_failure', 'duplicate_or_superseded', 'expected_invalid_input',
      'no_action_needed', 'other',
    ]);
    expect(failedAiRunReasonsFor('dismiss')).not.toContain('provider_instability');
  });

  it('submits the displayed review version and does not expose an editable version control', () => {
    const html = renderToStaticMarkup(createElement(FailedAiRunDecisionForm, {
      api: api(),
      runId,
      displayedReviewVersion: 7,
      onRefresh: async () => undefined,
      onSessionExpired: () => undefined,
    }));

    expect(html).toMatch(/type="hidden"[^>]*name="expectedReviewVersion"[^>]*value="7"/);
    expect(html).not.toMatch(/type="(?:number|text)"[^>]*name="expectedReviewVersion"/);
  });

  it('switches to the first compatible reason and submits that draft with the displayed version', async () => {
    const switched = changeFailedAiRunDecision({
      decision: 'needs_investigation',
      reasonCode: 'schema_regression',
      note: null,
    }, 'dismiss');
    expect(switched).toEqual({
      decision: 'dismiss',
      reasonCode: 'transient_failure',
      note: null,
    });

    const commands: FailedAiRunDecisionCommand[] = [];
    await submitFailedAiRunDecision({
      api: api({ decide: async (_id, command) => {
        commands.push(command);
        return okDecision(false);
      } }),
      runId,
      displayedReviewVersion: 11,
      ...switched,
      refresh: async () => undefined,
      sessionExpired: () => undefined,
    });
    expect(commands).toEqual([{
      version: 1,
      expectedReviewVersion: 11,
      decision: 'dismiss',
      reasonCode: 'transient_failure',
      note: null,
    }]);
  });

  it('disables all editable controls while submitting and prevents a duplicate command', async () => {
    const html = renderToStaticMarkup(createElement(FailedAiRunDecisionForm, {
      api: api(), runId, displayedReviewVersion: 4,
      onRefresh: async () => undefined, onSessionExpired: () => undefined,
      initialState: { status: 'submitting' },
    }));
    expect(html.match(/disabled=""/g)).toHaveLength(4);

    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const gate = createPendingActionGate();
    const input = {
      api: api({ decide: async () => {
        calls += 1;
        await waiting;
        return okDecision(false);
      } }),
      runId,
      displayedReviewVersion: 4,
      decision: 'dismiss' as const,
      reasonCode: 'no_action_needed' as const,
      note: null,
      refresh: async () => undefined,
      sessionExpired: () => undefined,
    };
    const first = submitFailedAiRunDecisionOnce(gate, input);
    const second = await submitFailedAiRunDecisionOnce(gate, input);
    expect(second).toEqual({ status: 'submitting' });
    expect(calls).toBe(1);
    release?.();
    await expect(first).resolves.toEqual({ status: 'saved' });
  });

  it('normalizes optional notes by Unicode code points instead of UTF-16 units', () => {
    const exactly = '🪂'.repeat(1000);
    const normalized = normalizeReviewNoteInput(`${exactly}🪂`);
    expect(Array.from(normalized)).toHaveLength(1000);
    expect(normalized).toBe(exactly);

    const html = renderToStaticMarkup(createElement(FailedAiRunDecisionForm, {
      api: api(), runId, displayedReviewVersion: 4,
      onRefresh: async () => undefined, onSessionExpired: () => undefined,
    }));
    expect(html).not.toMatch(/maxlength=/i);
    expect(html).toContain('0 / 1000');
  });

  it.each([false, true])('refetches after an accepted decision (replayed=%s)', async (replayed) => {
    const commands: FailedAiRunDecisionCommand[] = [];
    let refreshes = 0;
    const state = await submitFailedAiRunDecision({
      api: api({ decide: async (_id, command) => {
        commands.push(command);
        return okDecision(replayed);
      } }),
      runId,
      displayedReviewVersion: 7,
      decision: 'dismiss',
      reasonCode: 'no_action_needed',
      note: '  bounded note  ',
      refresh: async () => { refreshes += 1; },
      sessionExpired: () => undefined,
    });

    expect(commands).toEqual([{
      version: 1,
      expectedReviewVersion: 7,
      decision: 'dismiss',
      reasonCode: 'no_action_needed',
      note: 'bounded note',
    }]);
    expect(refreshes).toBe(1);
    expect(state).toEqual({ status: 'saved' });
  });

  it('refetches on a version conflict and returns bounded conflict copy', async () => {
    let refreshes = 0;
    const state = await submitFailedAiRunDecision({
      api: api({ decide: async () => ({
        ok: false, state: 'conflict', code: 'review_version_conflict',
      }) }),
      runId,
      displayedReviewVersion: 3,
      decision: 'needs_investigation',
      reasonCode: 'schema_regression',
      note: null,
      refresh: async () => { refreshes += 1; },
      sessionExpired: () => undefined,
    });

    expect(refreshes).toBe(1);
    expect(state).toEqual({ status: 'conflict' });
    const html = renderToStaticMarkup(createElement(FailedAiRunDecisionForm, {
      api: api(), runId, displayedReviewVersion: 3,
      onRefresh: async () => undefined, onSessionExpired: () => undefined,
      initialState: state,
    }));
    expect(html).toContain('审核状态已变化，已刷新最新版本，请重新确认后提交。');
  });

  it('returns bounded forbidden copy without leaking the rejected payload', async () => {
    const state = await submitFailedAiRunDecision({
      api: api({ decide: async () => failure('forbidden') }),
      runId,
      displayedReviewVersion: 3,
      decision: 'needs_investigation',
      reasonCode: 'other',
      note: 'password=secret provider detail',
      refresh: async () => undefined,
      sessionExpired: () => undefined,
    });

    expect(state).toEqual({ status: 'forbidden' });
    const html = renderToStaticMarkup(createElement(FailedAiRunDecisionForm, {
      api: api(), runId, displayedReviewVersion: 3,
      onRefresh: async () => undefined, onSessionExpired: () => undefined,
      initialState: state,
    }));
    expect(html).toContain('当前账号没有有效的审核权限。');
    expect(html).not.toMatch(/password|secret|provider detail/i);
  });
});

function session(overrides: Partial<ReviewSessionController> = {}): ReviewSessionController {
  return {
    signIn: async () => ({ ok: true }),
    getAccessToken: async () => 'review-access-token',
    signOut: async () => undefined,
    ...overrides,
  };
}

function api(overrides: Partial<ReviewApiClient> = {}): ReviewApiClient {
  return {
    list: async () => okList([]),
    get: async () => okDetail(detail),
    decide: async () => okDecision(false),
    ...overrides,
  };
}

function okList(items: FailedAiRunListItem[]): ReviewApiSuccess<{
  readonly version: 1;
  readonly items: FailedAiRunListItem[];
}> {
  return { ok: true, data: { version: 1, items }, nextCursor: null };
}

function okDetail(value: FailedAiRunDetailDto): ReviewApiSuccess<FailedAiRunDetailDto> {
  return { ok: true, data: value, nextCursor: null };
}

function okDecision(replayed: boolean) {
  return {
    ok: true,
    data: {
      version: 1,
      commandId: 'a7000000-0000-4000-8000-000000000001',
      runId,
      decisionId,
      reviewVersion: 8,
      reviewState: 'dismissed',
      replayed,
    },
    nextCursor: null,
  } as const;
}

function failure(state: ReviewApiFailure['state']): ReviewApiFailure {
  if (state === 'conflict') return { ok: false, state, code: 'review_version_conflict' };
  return { ok: false, state };
}
