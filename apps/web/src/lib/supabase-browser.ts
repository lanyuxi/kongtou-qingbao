import { createBrowserSupabaseClient } from '@airdrop/database';

import { parsePublicEnvironment } from './env.js';
import type { ReviewAuthPort } from './review-session.js';

interface ReviewSupabaseAuth {
  signInWithPassword(input: { email: string; password: string }): Promise<{
    data: { session: { access_token: string } | null };
    error: unknown | null;
  }>;
  getSession(): Promise<{
    data: { session: { access_token: string } | null };
    error: unknown | null;
  }>;
  signOut(): Promise<{ error: unknown | null }>;
}

export function createReviewBrowserSupabaseClient(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const parsed = parsePublicEnvironment(environment);
  return createBrowserSupabaseClient({
    url: parsed.supabaseUrl,
    anonKey: parsed.supabaseAnonKey,
  });
}

export function createReviewBrowserAuthPort(
  auth: ReviewSupabaseAuth = createReviewBrowserSupabaseClient().auth,
): ReviewAuthPort {
  return {
    async signInWithPassword(input) {
      const result = await auth.signInWithPassword(input);
      if (result.error !== null) throw authenticationFailure();
      return { accessToken: result.data.session?.access_token ?? null };
    },

    async getAccessToken() {
      const result = await auth.getSession();
      if (result.error !== null) throw authenticationFailure();
      return result.data.session?.access_token ?? null;
    },

    async signOut() {
      const result = await auth.signOut();
      if (result.error !== null) throw authenticationFailure();
    },
  };
}

function authenticationFailure(): Error {
  return new Error('Review authentication failed.');
}
