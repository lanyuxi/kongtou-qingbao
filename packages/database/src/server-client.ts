import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './generated/database.types.js';

export interface ServerSupabaseClientOptions {
  readonly url: string;
  readonly serviceRoleKey: string;
}

export function createServerSupabaseClient(
  options: ServerSupabaseClientOptions,
): SupabaseClient<Database> {
  return createClient<Database>(options.url, options.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
