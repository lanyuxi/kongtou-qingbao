'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  TaskManager,
  type TaskManagerState,
} from '../../components/execution/task-manager.js';
import {
  createExecutionApiClient,
  type ExecutionApiClient,
} from '../../lib/execution-api-client.js';
import { useExecutionBrowserRuntime } from '../../lib/execution-browser-runtime.js';
import { buildSignInPath } from '../../lib/identity-auth-session.js';

const returnPath = '/tasks';

export default function TasksPage() {
  const runtime = useExecutionBrowserRuntime();
  const router = useRouter();
  const [state, setState] = useState<TaskManagerState>({ status: 'loading' });

  const reload = useCallback(async () => {
    const api = runtime?.api;
    if (api === undefined) return;
    setState({ status: 'loading' });
    const result = await api.listTasks();
    if (result.ok) {
      setState({ status: 'ready', tasks: result.data });
      return;
    }
    // An expired session keeps the page address, so signing in again returns
    // here and the pending action is still described by the reload.
    if (result.code === 'execution_session_required') {
      setState({ status: 'sign_in_required' });
      router.replace(buildSignInPath(returnPath));
      return;
    }
    setState({ status: 'failed', code: 'execution_query_failed' });
  }, [runtime, router]);

  useEffect(() => { void reload(); }, [reload]);

  return <TaskManager state={state} api={runtime?.api ?? unavailableClient} onReload={reload} />;
}

const unavailableClient: ExecutionApiClient = createExecutionApiClient({
  session: { getAccessToken: async () => null },
  fetch: globalThis.fetch.bind(globalThis),
  ids: { generate: () => crypto.randomUUID() },
});
