'use client';

import { useEffect, useState } from 'react';

import { createExecutionApiClient, type ExecutionApiClient } from './execution-api-client.js';
import { createReviewBrowserSupabaseClient } from './supabase-browser.js';

export interface ExecutionBrowserRuntime {
  readonly api: ExecutionApiClient;
}

// The session port is the browser Supabase client, so a task request carries the
// caller's own token and nothing else. No service key and no server session.
export function createExecutionBrowserSession(auth: {
  getSession(): Promise<{
    data: { session: { access_token: string } | null };
    error: unknown | null;
  }>;
}): { getAccessToken(): Promise<string | null> } {
  return {
    async getAccessToken() {
      try {
        const result = await auth.getSession();
        return result.error === null ? result.data.session?.access_token ?? null : null;
      } catch {
        return null;
      }
    },
  };
}

function createExecutionBrowserRuntime(): ExecutionBrowserRuntime {
  const dependencies = {
    fetch: globalThis.fetch.bind(globalThis),
    ids: { generate: () => crypto.randomUUID() },
  };
  try {
    const supabase = createReviewBrowserSupabaseClient();
    return {
      api: createExecutionApiClient({
        ...dependencies,
        session: createExecutionBrowserSession(supabase.auth),
      }),
    };
  } catch {
    return {
      api: createExecutionApiClient({
        ...dependencies,
        session: { getAccessToken: async () => null },
      }),
    };
  }
}

export function useExecutionBrowserRuntime(): ExecutionBrowserRuntime | null {
  const [runtime, setRuntime] = useState<ExecutionBrowserRuntime | null>(null);
  useEffect(() => { setRuntime(createExecutionBrowserRuntime()); }, []);
  return runtime;
}
