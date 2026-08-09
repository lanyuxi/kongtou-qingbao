import { z } from 'zod';

const publicEnvironmentSchema = z
  .object({
    supabaseUrl: z.string().url(),
    supabaseAnonKey: z.string().trim().min(1)
  })
  .strict();

export const parsePublicEnvironment = (environment: NodeJS.ProcessEnv = process.env) =>
  publicEnvironmentSchema.parse({
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
  });
