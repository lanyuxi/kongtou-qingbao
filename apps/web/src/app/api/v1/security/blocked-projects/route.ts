import { createSecurityPublicRepository } from '@airdrop/database';
import { createSecurityPublicBlockedProjectsHandler } from '../../../../../lib/security-review-handlers.js';
import { createServerSupabaseClient } from '../../../../../lib/supabase-server.js';
let handler: ReturnType<typeof createSecurityPublicBlockedProjectsHandler> | undefined;
function getHandler() { if (handler !== undefined) return handler; handler = createSecurityPublicBlockedProjectsHandler({ publicSecurity: createSecurityPublicRepository(createServerSupabaseClient()), ids: { generate: () => crypto.randomUUID() } }); return handler; }
export async function GET(request: Request) { return getHandler()(request); }
