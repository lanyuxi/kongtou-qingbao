import 'server-only';

import { z } from 'zod';

const serverEnvironmentSchema = z
  .object({
    supabaseServiceRoleKey: z.string().trim().min(1),
    databaseUrl: z.string().url()
  })
  .strict();

export const parseServerEnvironment = (environment: NodeJS.ProcessEnv = process.env) =>
  serverEnvironmentSchema.parse({
    supabaseServiceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: environment.DATABASE_URL
  });
