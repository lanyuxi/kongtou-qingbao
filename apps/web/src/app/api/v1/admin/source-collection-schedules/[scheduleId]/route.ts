import { createScheduleCommandRepository } from '@airdrop/database/schedule-admin';

import { createAuthenticatedUserVerifier } from '../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../lib/env.js';
import { createSourceScheduleCommandHandler } from '../../../../../../lib/source-schedule-command-handler.js';
import { parseServerEnvironment } from '../../../../../../lib/server-env.js';

let handler: ReturnType<typeof createSourceScheduleCommandHandler> | undefined;

function getHandler(): ReturnType<typeof createSourceScheduleCommandHandler> {
  if (handler !== undefined) return handler;
  const publicEnvironment = parsePublicEnvironment();
  const serverEnvironment = parseServerEnvironment();
  handler = createSourceScheduleCommandHandler({
    auth: createAuthenticatedUserVerifier(publicEnvironment),
    schedules: createScheduleCommandRepository(serverEnvironment.queueAdminDatabaseUrl),
    ids: { generate: () => crypto.randomUUID() },
  });
  return handler;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ scheduleId: string }> },
): Promise<Response> {
  return getHandler()(request, context);
}
