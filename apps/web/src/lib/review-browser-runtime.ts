'use client';

import { useEffect, useState } from 'react';

import { createReviewApiClient, type ReviewApiClient } from './review-api-client.js';
import { createReviewSessionController, type ReviewSessionController } from './review-session.js';
import {
  createReviewBrowserAuthPort,
  createReviewBrowserSupabaseClient,
} from './supabase-browser.js';

export interface ReviewBrowserRuntime {
  readonly session: ReviewSessionController;
  readonly api: ReviewApiClient;
}

export function createReviewBrowserRuntime(): ReviewBrowserRuntime {
  const supabase = createReviewBrowserSupabaseClient();
  const session = createReviewSessionController(createReviewBrowserAuthPort(supabase.auth));
  return {
    session,
    api: createReviewApiClient({
      session,
      fetch: globalThis.fetch.bind(globalThis),
      ids: { generate: () => crypto.randomUUID() },
    }),
  };
}

export function useReviewBrowserRuntime(): ReviewBrowserRuntime | null {
  const [runtime, setRuntime] = useState<ReviewBrowserRuntime | null>(null);
  useEffect(() => { setRuntime(createReviewBrowserRuntime()); }, []);
  return runtime;
}
