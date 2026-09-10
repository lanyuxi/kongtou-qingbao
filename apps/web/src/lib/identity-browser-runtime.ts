'use client';

import { useEffect, useState } from 'react';

import { createReviewBrowserSupabaseClient } from './supabase-browser.js';
import {
  createIdentityApiClient,
  type IdentityApiClient,
  type IdentitySessionPort,
} from './identity-api-client.js';
import {
  createIdentityAuthController,
  type IdentityAuthController,
  type IdentityAuthPort,
} from './identity-auth-session.js';

interface IdentityBrowserAuth {
  setSession(input: {
    access_token: string;
    refresh_token: string;
  }): Promise<{ error: unknown | null }>;
  signUp(input: {
    email: string;
    password: string;
    options: { data: { phone: string }; emailRedirectTo: string };
  }): Promise<{ error: unknown | null }>;
  getSession(): Promise<{
    data: { session: { access_token: string } | null };
    error: unknown | null;
  }>;
  signOut(): Promise<{ error: unknown | null }>;
}

export interface IdentityBrowserRuntime {
  readonly api: IdentityApiClient;
  readonly auth: IdentityAuthController;
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

type EndpointCall = (
  path: string,
  body: Record<string, unknown>,
) => Promise<{ readonly status: number; readonly payload: unknown }>;

/** Posts JSON to one of our own identity endpoints and returns the envelope. */
export function createIdentityEndpointCall(
  fetchImpl: typeof globalThis.fetch,
): EndpointCall {
  return async function call(path, body) {
    const response = await fetchImpl(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return { status: response.status, payload };
  };
}

/**
 * Password-based end-user auth (Phase 11).
 *
 * Sign-in and recovery both go through our own endpoints rather than calling
 * Supabase directly, because those endpoints are what hold the phone→email
 * mapping. The browser only ever receives tokens, never the address.
 */
export function createIdentityBrowserAuthPort(
  auth: IdentityBrowserAuth,
  call: EndpointCall,
): IdentityAuthPort {
  return {
    async signInWithPhone({ phone, password }) {
      const { status, payload } = await call('/api/v1/identity/sign-in', { phone, password });
      if (status === 401) return { error: null, session: null };
      if (!isRecord(payload) || payload.ok !== true) {
        return { error: new Error('Sign-in failed.'), session: null };
      }
      const data = payload.data;
      if (
        !isRecord(data) ||
        typeof data.accessToken !== 'string' ||
        typeof data.refreshToken !== 'string'
      ) {
        return { error: new Error('Sign-in returned no session.'), session: null };
      }
      return {
        error: null,
        session: { accessToken: data.accessToken, refreshToken: data.refreshToken },
      };
    },

    async adoptSession({ accessToken, refreshToken }) {
      const result = await auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return { error: result.error };
    },

    async signUpWithPassword(input) {
      const result = await auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          // Lands in auth.users.raw_user_meta_data; the database trigger copies
          // it onto the profile where the unique index enforces one number per
          // account.
          data: { phone: input.phone },
          // Without this the confirmation link points at the project Site URL.
          emailRedirectTo: input.redirectTo,
        },
      });
      return { error: result.error };
    },

    async requestPasswordReset({ phone, redirectTo }) {
      const { status } = await call('/api/v1/identity/request-password-reset', {
        phone,
        redirectTo,
      });
      // The endpoint answers 200 for unknown numbers too, so anything other
      // than a transport/server failure counts as "request accepted".
      return { error: status < 500 ? null : new Error('Reset request failed.') };
    },

    async getSession() {
      const result = await auth.getSession();
      return {
        hasSession: result.error === null && result.data.session !== null,
        error: result.error,
      };
    },

    async signOut() {
      const result = await auth.signOut();
      return { error: result.error };
    },
  };
}

const unavailableAuthPort: IdentityAuthPort = {
  async signInWithPhone() {
    return { error: new Error('Identity auth is unavailable.'), session: null };
  },
  async adoptSession() {
    return { error: new Error('Identity auth is unavailable.') };
  },
  async signUpWithPassword() {
    return { error: new Error('Identity auth is unavailable.') };
  },
  async requestPasswordReset() {
    return { error: new Error('Identity auth is unavailable.') };
  },
  async getSession() {
    return { hasSession: false, error: new Error('Identity auth is unavailable.') };
  },
  async signOut() {
    return { error: new Error('Identity auth is unavailable.') };
  },
};

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
      auth: createIdentityAuthController(
        createIdentityBrowserAuthPort(
          supabase.auth,
          createIdentityEndpointCall(dependencies.fetch),
        ),
      ),
    };
  } catch {
    return {
      api: createIdentityApiClient({
        ...dependencies,
        session: { getAccessToken: async () => null },
      }),
      auth: createIdentityAuthController(unavailableAuthPort),
    };
  }
}

export function useIdentityBrowserRuntime(): IdentityBrowserRuntime | null {
  const [runtime, setRuntime] = useState<IdentityBrowserRuntime | null>(null);
  useEffect(() => { setRuntime(createIdentityBrowserRuntime()); }, []);
  return runtime;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
