import { z } from 'zod';

const publicEnvironmentSchema = z
  .object({
    supabaseUrl: z.string().url(),
    supabaseAnonKey: z.string().trim().min(1)
  })
  .strict();

export interface PublicEnvironmentSource {
  readonly NEXT_PUBLIC_SUPABASE_URL: string | undefined;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY: string | undefined;
  readonly SUPABASE_INTERNAL_URL?: string | undefined;
}

export const parsePublicEnvironment = (environment: PublicEnvironmentSource = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}) =>
  publicEnvironmentSchema.parse({
    // Server-side callers (route handlers, SSR loaders) may override the
    // public URL with an internal one: on the production host the cloud
    // security group blocks hairpin access to the machine's own public IP,
    // so server fetches go through the loopback Kong port instead.
    supabaseUrl: environment.SUPABASE_INTERNAL_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
  });
