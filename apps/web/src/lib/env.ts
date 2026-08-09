import { z } from 'zod';

const publicEnvironmentSchema = z
  .object({
    supabaseUrl: z.string().url(),
    supabaseAnonKey: z.string().trim().min(1)
  })
  .strict();

const serverEnvironmentSchema = z
  .object({
    supabaseServiceRoleKey: z.string().trim().min(1),
    databaseUrl: z.string().url()
  })
  .strict();

export const parsePublicEnvironment = (environment: NodeJS.ProcessEnv = process.env) =>
  publicEnvironmentSchema.parse({
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY
  });

export const parseServerEnvironment = (environment: NodeJS.ProcessEnv = process.env) =>
  serverEnvironmentSchema.parse({
    supabaseServiceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: environment.DATABASE_URL
  });
