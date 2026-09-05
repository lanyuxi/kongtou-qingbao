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
  signInWithOtp(input: {
    email: string;
    options: { emailRedirectTo: string };
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

/**
 * End-user sign-in is magic-link only (decision D1): this port deliberately has
 * no password credential method.
 */
export function createIdentityBrowserAuthPort(auth: IdentityBrowserAuth): IdentityAuthPort {
  return {
    async sendMagicLink(input) {
      const result = await auth.signInWithOtp({
        email: input.email,
        options: { emailRedirectTo: input.redirectTo },
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
  async sendMagicLink() {
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
      auth: createIdentityAuthController(createIdentityBrowserAuthPort(supabase.auth)),
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
