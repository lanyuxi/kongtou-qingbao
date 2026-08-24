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
}

export const parsePublicEnvironment = (environment: PublicEnvironmentSource = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}) =>
  publicEnvironmentSchema.parse({
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
  });
