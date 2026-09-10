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
  signInWithPassword(input: {
    email: string;
    password: string;
  }): Promise<{ error: unknown | null }>;
  signUp(input: {
    email: string;
    password: string;
    options: { data: { phone: string }; emailRedirectTo: string };
  }): Promise<{ error: unknown | null }>;
  resetPasswordForEmail(
    email: string,
    options: { redirectTo: string },
  ): Promise<{ error: unknown | null }>;
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

/**
 * Asks the BFF which address a mobile number belongs to. The endpoint answers
 * uniformly for unknown numbers (returning null) so this step cannot be used
 * to probe which numbers are registered.
 */
export function createResolveLoginEmail(
  fetchImpl: typeof globalThis.fetch,
): (phone: string) => Promise<{ email: string | null; error: unknown | null }> {
  return async function resolveLoginEmail(phone) {
    try {
      const response = await fetchImpl('/api/v1/identity/resolve-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.ok !== true) {
        return { email: null, error: new Error('Identity lookup failed.') };
      }
      const data = payload.data;
      if (!isRecord(data) || typeof data.email !== 'string') {
        return { email: null, error: null };
      }
      return { email: data.email, error: null };
    } catch {
      return { email: null, error: new Error('Identity lookup failed.') };
    }
  };
}

/**
 * Password-based end-user auth (Phase 11). Accounts are created with an email
 * address — that is what password recovery is mailed to — while the mobile
 * number travels in user metadata and becomes the login identifier.
 */
export function createIdentityBrowserAuthPort(
  auth: IdentityBrowserAuth,
  lookupLoginEmail: (phone: string) => Promise<{ email: string | null; error: unknown | null }>,
): IdentityAuthPort {
  return {
    async resolveLoginEmail(input) {
      return lookupLoginEmail(input.phone);
    },

    async signInWithPassword(input) {
      const result = await auth.signInWithPassword({
        email: input.email,
        password: input.password,
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

    async requestPasswordReset(input) {
      const result = await auth.resetPasswordForEmail(input.email, {
        redirectTo: input.redirectTo,
      });
      return { error: result.error };
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
  async resolveLoginEmail() {
    return { email: null, error: new Error('Identity auth is unavailable.') };
  },
  async signInWithPassword() {
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
        createIdentityBrowserAuthPort(supabase.auth, createResolveLoginEmail(dependencies.fetch)),
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
