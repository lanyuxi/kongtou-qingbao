import { createSecurityPublicRepository } from '@airdrop/database';
import { createSecurityReviewRepository } from '@airdrop/database/security-review';
import { createAuthenticatedUserVerifier } from '../../../../../../../../lib/authenticated-user.js';
import { parsePublicEnvironment } from '../../../../../../../../lib/env.js';
import { createSecurityCandidateReviewHandler } from '../../../../../../../../lib/security-review-handlers.js';
import { createServerSupabaseClient } from '../../../../../../../../lib/supabase-server.js';
let handler: ReturnType<typeof createSecurityCandidateReviewHandler> | undefined;
function getHandler() { if (handler !== undefined) return handler; const environment = parsePublicEnvironment(); handler = createSecurityCandidateReviewHandler({ auth: createAuthenticatedUserVerifier(environment), reviews: createSecurityReviewRepository({ url: environment.supabaseUrl, anonKey: environment.supabaseAnonKey }), publicSecurity: createSecurityPublicRepository(createServerSupabaseClient()), ids: { generate: () => crypto.randomUUID() } }); return handler; }
export async function POST(request: Request, context: { params: Promise<{ candidateId: string }> }) { return getHandler()(request, context); }
