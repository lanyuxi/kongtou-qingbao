import { createSecurityPublicRepository } from '@airdrop/database';
import { createSecurityReviewRepository } from '@airdrop/database/security-review';
import { createAuthenticatedUserVerifier } from '../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../lib/env.js';
import { createSecurityCandidateListHandler, createSecurityCandidateSubmitHandler } from '../../../../../../lib/security-review-handlers.js';
import { createServerSupabaseClient } from '../../../../../../lib/supabase-server.js';

let handlers: { get: ReturnType<typeof createSecurityCandidateListHandler>; post: ReturnType<typeof createSecurityCandidateSubmitHandler> } | undefined;
function getHandlers() { if (handlers !== undefined) return handlers; const environment = parsePublicEnvironment(); const dependencies = { auth: createAuthenticatedUserVerifier(environment), reviews: createSecurityReviewRepository({ url: environment.supabaseUrl, anonKey: environment.supabaseAnonKey }), publicSecurity: createSecurityPublicRepository(createServerSupabaseClient()), ids: { generate: () => crypto.randomUUID() } }; handlers = { get: createSecurityCandidateListHandler(dependencies), post: createSecurityCandidateSubmitHandler(dependencies) }; return handlers; }
export async function GET(request: Request) { return getHandlers().get(request); }
export async function POST(request: Request) { return getHandlers().post(request); }
