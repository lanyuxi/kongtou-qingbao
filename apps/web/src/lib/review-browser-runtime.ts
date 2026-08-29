'use client';

import { useEffect, useState } from 'react';

import { createReviewApiClient, type ReviewApiClient } from './review-api-client.js';
import { createReviewSessionController, type ReviewSessionController } from './review-session.js';
import {
  createSecurityReviewApiClient,
  type SecurityReviewApiClient,
} from './security-review-api-client.js';
import {
  createReviewBrowserAuthPort,
  createReviewBrowserSupabaseClient,
} from './supabase-browser.js';

export interface ReviewBrowserRuntime {
  readonly session: ReviewSessionController;
  readonly api: ReviewApiClient;
  readonly securityApi: SecurityReviewApiClient;
}

export function createReviewBrowserRuntime(): ReviewBrowserRuntime {
  const supabase = createReviewBrowserSupabaseClient();
  const session = createReviewSessionController(createReviewBrowserAuthPort(supabase.auth));
  const dependencies = {
    session,
    fetch: globalThis.fetch.bind(globalThis),
    ids: { generate: () => crypto.randomUUID() },
  };
  return {
    session,
    api: createReviewApiClient(dependencies),
    securityApi: createSecurityReviewApiClient(dependencies),
  };
}

export function useReviewBrowserRuntime(): ReviewBrowserRuntime | null {
  const [runtime, setRuntime] = useState<ReviewBrowserRuntime | null>(null);
  useEffect(() => { setRuntime(createReviewBrowserRuntime()); }, []);
  return runtime;
}
