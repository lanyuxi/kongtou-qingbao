'use client';

import { useEffect, useState } from 'react';

import { createReviewBrowserSupabaseClient } from './supabase-browser.js';
import {
  createIdentityApiClient,
  type IdentityApiClient,
  type IdentitySessionPort,
} from './identity-api-client.js';

interface IdentityBrowserAuth {
  getSession(): Promise<{
    data: { session: { access_token: string } | null };
    error: unknown | null;
  }>;
}

export interface IdentityBrowserRuntime {
  readonly api: IdentityApiClient;
}

export function createIdentityBrowserSession(auth: IdentityBrowserAuth): IdentitySessionPort {
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

export function createIdentityBrowserRuntime(): IdentityBrowserRuntime {
  const dependencies = {
    fetch: globalThis.fetch.bind(globalThis),
    ids: { generate: () => crypto.randomUUID() },
  };
  try {
    const supabase = createReviewBrowserSupabaseClient();
    return {
      api: createIdentityApiClient({
        ...dependencies,
        session: createIdentityBrowserSession(supabase.auth),
      }),
    };
  } catch {
    return {
      api: createIdentityApiClient({
        ...dependencies,
        session: { getAccessToken: async () => null },
      }),
    };
  }
}

export function useIdentityBrowserRuntime(): IdentityBrowserRuntime | null {
  const [runtime, setRuntime] = useState<IdentityBrowserRuntime | null>(null);
  useEffect(() => { setRuntime(createIdentityBrowserRuntime()); }, []);
  return runtime;
}
