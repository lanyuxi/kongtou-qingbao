import 'server-only';

import { createBrowserSupabaseClient } from '@airdrop/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@airdrop/database';
import { z } from 'zod';

const serverSupabaseEnvironmentSchema = z
  .object({
    supabaseUrl: z.string().url(),
    supabaseAnonKey: z.string().min(1),
  })
  .strict();

export function createServerSupabaseClient(
  environment: NodeJS.ProcessEnv = process.env,
): SupabaseClient<Database> {
  const parsed = serverSupabaseEnvironmentSchema.parse({
    // See lib/env.ts: the server talks to Kong through the loopback port;
    // the public URL stays reserved for the browser bundle.
    supabaseUrl: environment.SUPABASE_INTERNAL_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  return createBrowserSupabaseClient({
    url: parsed.supabaseUrl,
    anonKey: parsed.supabaseAnonKey,
  });
}
