import 'server-only';

import { z } from 'zod';

const serverEnvironmentSchema = z
  .object({
    queueAdminDatabaseUrl: z.string().url(),
  })
  .strict();

export const parseServerEnvironment = (environment: NodeJS.ProcessEnv = process.env) =>
  serverEnvironmentSchema.parse({
    queueAdminDatabaseUrl: environment.AIRDROP_QUEUE_ADMIN_DATABASE_URL,
  });
