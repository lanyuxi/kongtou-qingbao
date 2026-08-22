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
  failedAiRunReasonsFor,
  submitFailedAiRunDecision,
} from '../components/review/failed-ai-run-decision-form.js';
import {
  FailedAiRunDetail,
  loadFailedAiRunDetail,
} from '../components/review/failed-ai-run-detail.js';
import {
  FailedAiRunList,
  loadFailedAiRunList,
} from '../components/review/failed-ai-run-list.js';
import {
  SignInForm,
  submitReviewSignIn,
} from '../components/review/sign-in-form.js';
import { ReviewShell, signOutAndRedirect } from '../app/review/review-shell.js';
import type {
  ReviewApiClient,
  ReviewApiFailure,
  ReviewApiSuccess,
} from '../lib/review-api-client.js';
import type { ReviewSessionController } from '../lib/review-session.js';

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

  it('uses stable failure explanations and renders history chronologically without controls', () => {
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
          createdAt: '2026-08-22T02:00:00.000Z',
        },
        {
          version: 1,
          decisionId,
          reviewVersion: 1,
          decision: 'needs_investigation',
          reasonCode: 'provider_instability',
          note: 'first-note',
          reviewerUserId,
          createdAt: '2026-08-22T01:00:00.000Z',
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(FailedAiRunDetail, { detail: withHistory }));

    expect(html).toContain('AI 服务暂时未完成该阶段。');
    expect(html.indexOf('first-note')).toBeLessThan(html.indexOf('second-note'));
    expect(html).not.toMatch(/<input\b|<select\b|<textarea\b|contenteditable|<button\b/i);
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
