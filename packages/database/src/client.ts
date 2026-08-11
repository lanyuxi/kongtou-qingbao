import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './generated/database.types.js';

export interface BrowserSupabaseClientOptions {
  readonly url: string;
  readonly anonKey: string;
}

export function createBrowserSupabaseClient(
  options: BrowserSupabaseClientOptions,
): SupabaseClient<Database> {
  return createClient<Database>(options.url, options.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
}
