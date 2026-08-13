import { createScheduleCommandRepository } from '@airdrop/database/schedule-admin';

import { createAuthenticatedUserVerifier } from '../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../lib/env.js';
import { createSourceScheduleCommandHandler } from '../../../../../../lib/source-schedule-command-handler.js';
import { parseServerEnvironment } from '../../../../../../lib/server-env.js';

export async function POST(
  request: Request,
  context: { params: Promise<{ scheduleId: string }> },
): Promise<Response> {
  const publicEnvironment = parsePublicEnvironment();
  const serverEnvironment = parseServerEnvironment();
  const handler = createSourceScheduleCommandHandler({
    auth: createAuthenticatedUserVerifier(publicEnvironment),
    schedules: createScheduleCommandRepository(serverEnvironment.queueAdminDatabaseUrl),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler(request, context);
}
