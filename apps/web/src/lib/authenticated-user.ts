import 'server-only';

import { createClient } from '@supabase/supabase-js';

export interface AuthenticatedUserVerifier {
  verifyAuthorizationHeader(value: string | null): Promise<{ userId: string } | null>;
}

export function createAuthenticatedUserVerifier(options: {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
}): AuthenticatedUserVerifier {
  const client = createClient(options.supabaseUrl, options.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return {
    verifyAuthorizationHeader: async (value) => {
      const token = bearerToken(value);
      if (token === null) return null;
      const { data, error } = await client.auth.getUser(token);
      return error === null && data.user !== null ? { userId: data.user.id } : null;
    },
  };
}

function bearerToken(value: string | null): string | null {
  if (value === null) return null;
  const match = /^Bearer ([^\s]+)$/.exec(value);
  return match?.[1] ?? null;
}
