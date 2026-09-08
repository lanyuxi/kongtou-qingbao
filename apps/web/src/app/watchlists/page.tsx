'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  WatchlistManager,
  type WatchlistManagerState,
} from '../../components/execution/watchlist-manager.js';
import {
  createExecutionApiClient,
  type ExecutionApiClient,
} from '../../lib/execution-api-client.js';
import { useExecutionBrowserRuntime } from '../../lib/execution-browser-runtime.js';
import { buildSignInPath } from '../../lib/identity-auth-session.js';

const returnPath = '/watchlists';

export default function WatchlistsPage() {
  const runtime = useExecutionBrowserRuntime();
  const router = useRouter();
  const [state, setState] = useState<WatchlistManagerState>({ status: 'loading' });

  const reload = useCallback(async () => {
    const api = runtime?.api;
    if (api === undefined) return;
    setState({ status: 'loading' });
    const result = await api.listWatchlists();
    if (result.ok) {
      setState({ status: 'ready', watchlists: result.data });
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

  return <WatchlistManager state={state} api={runtime?.api ?? unavailableClient} onReload={reload} />;
}

const unavailableClient: ExecutionApiClient = createExecutionApiClient({
  session: { getAccessToken: async () => null },
  fetch: globalThis.fetch.bind(globalThis),
  ids: { generate: () => crypto.randomUUID() },
});
