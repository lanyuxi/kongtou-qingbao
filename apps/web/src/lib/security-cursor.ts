import { blockedProjectSecurityCursorSchema } from '@airdrop/contracts';

/**
 * Validates an untrusted blocked-projects cursor from a query string at the page
 * boundary. A malformed or hostile value falls back to the first page instead of
 * reaching the repository's strict schema, which would surface as a server error.
 */
export function blockedCursorFromQuery(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return blockedProjectSecurityCursorSchema.safeParse(value).success ? value : null;
}
