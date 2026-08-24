import { describe, expect, it } from 'vitest';

import {
  createReviewSessionController,
  type ReviewAuthPort,
} from '../lib/review-session.js';
import type { PublicEnvironmentSource } from '../lib/env.js';
import {
  createReviewBrowserAuthPort,
  createReviewBrowserSupabaseClient,
} from '../lib/supabase-browser.js';

describe('review session controller', () => {
  it('returns a bounded sign-in failure without provider text', async () => {
    const auth = authPort({
      signInWithPassword: async () => {
        throw new Error('Supabase password=secret internal provider detail');
      },
    });
    const controller = createReviewSessionController(auth);

    const result = await controller.signIn('reviewer@example.test', 'password');

    expect(result).toEqual({ ok: false, code: 'sign_in_failed' });
    expect(JSON.stringify(result)).not.toMatch(/supabase|password|secret|provider/i);
  });

  it.each([null, '', '   '])('treats an unusable sign-in token %j as a generic failure', async (
    accessToken,
  ) => {
    const controller = createReviewSessionController(authPort({
      signInWithPassword: async () => ({ accessToken }),
    }));

    await expect(controller.signIn('reviewer@example.test', 'password'))
      .resolves.toEqual({ ok: false, code: 'sign_in_failed' });
  });

  it('does not retain the sign-in token and resolves the current token on demand', async () => {
    let currentToken = 'current-session-token';
    const controller = createReviewSessionController(authPort({
      signInWithPassword: async () => ({ accessToken: 'initial-sign-in-token' }),
      getAccessToken: async () => currentToken,
    }));

    await expect(controller.signIn('reviewer@example.test', 'password'))
      .resolves.toEqual({ ok: true });
    expect(await controller.getAccessToken()).toBe('current-session-token');

    currentToken = 'refreshed-session-token';
    expect(await controller.getAccessToken()).toBe('refreshed-session-token');
  });

  it('turns an expired or failing provider session into a missing token', async () => {
    const expired = createReviewSessionController(authPort({ getAccessToken: async () => null }));
    const failing = createReviewSessionController(authPort({
      getAccessToken: async () => {
        throw new Error('provider token=secret refresh failure');
      },
    }));

    await expect(expired.getAccessToken()).resolves.toBeNull();
    await expect(failing.getAccessToken()).resolves.toBeNull();
  });

  it('signs out without exposing provider failures', async () => {
    let calls = 0;
    const successful = createReviewSessionController(authPort({
      signOut: async () => { calls += 1; },
    }));
    const failing = createReviewSessionController(authPort({
      signOut: async () => {
        throw new Error('Supabase password=secret sign-out failure');
      },
    }));

    await expect(successful.signOut()).resolves.toBeUndefined();
    await expect(failing.signOut()).resolves.toBeUndefined();
    expect(calls).toBe(1);
  });
});

describe('review browser Supabase auth port', () => {
  it('passes only public Supabase values through the injectable client factory', () => {
    const options: Array<{ url: string; anonKey: string }> = [];
    const createClient = ((input: { url: string; anonKey: string }) => {
      options.push(input);
      return { auth: {} };
    }) as never;
    const environment: PublicEnvironmentSource & Record<string, string | undefined> = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://public-review.example.test',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-review-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'must-not-be-forwarded',
      AIRDROP_DATABASE_URL: 'postgresql://must-not-be-forwarded',
    };

    createReviewBrowserSupabaseClient(environment, createClient);

    expect(options).toEqual([{
      url: 'https://public-review.example.test',
      anonKey: 'public-review-anon-key',
    }]);
  });

  it('reads each token from the Supabase session and forwards credentials only to sign-in', async () => {
    const signIns: Array<{ email: string; password: string }> = [];
    let sessionToken = 'first-session-token';
    let signOutCalls = 0;
    const port = createReviewBrowserAuthPort({
      signInWithPassword: async (input) => {
        signIns.push(input);
        return { data: { session: { access_token: 'sign-in-token' } }, error: null };
      },
      getSession: async () => ({
        data: { session: { access_token: sessionToken } },
        error: null,
      }),
      signOut: async () => {
        signOutCalls += 1;
        return { error: null };
      },
    });

    await expect(port.signInWithPassword({ email: 'reviewer@example.test', password: 'password' }))
      .resolves.toEqual({ accessToken: 'sign-in-token' });
    await expect(port.getAccessToken()).resolves.toBe('first-session-token');
    sessionToken = 'refreshed-session-token';
    await expect(port.getAccessToken()).resolves.toBe('refreshed-session-token');
    await expect(port.signOut()).resolves.toBeUndefined();

    expect(signIns).toEqual([{ email: 'reviewer@example.test', password: 'password' }]);
    expect(signOutCalls).toBe(1);
  });

  it('does not expose Supabase error objects from the browser auth boundary', async () => {
    const providerError = { message: 'password=secret provider detail' };
    const port = createReviewBrowserAuthPort({
      signInWithPassword: async () => ({ data: { session: null }, error: providerError }),
      getSession: async () => ({ data: { session: null }, error: providerError }),
      signOut: async () => ({ error: providerError }),
    });

    await expect(port.signInWithPassword({ email: 'reviewer@example.test', password: 'password' }))
      .rejects.toThrow('Review authentication failed.');
    await expect(port.getAccessToken()).rejects.toThrow('Review authentication failed.');
    await expect(port.signOut()).rejects.toThrow('Review authentication failed.');
  });
});

function authPort(overrides: Partial<ReviewAuthPort>): ReviewAuthPort {
  return {
    signInWithPassword: async () => ({ accessToken: 'access-token' }),
    getAccessToken: async () => 'access-token',
    signOut: async () => undefined,
    ...overrides,
  };
}
