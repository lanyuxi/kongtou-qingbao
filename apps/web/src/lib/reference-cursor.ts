import {
  domainAuthorityReviewListCursorSchema,
  publicProjectReferenceCursorSchema,
  referenceReviewListCursorSchema,
} from '@airdrop/contracts';

/**
 * Validates an untrusted reference cursor from a query string at the page
 * boundary. A malformed or hostile value falls back to the first page instead
 * of reaching a repository's strict schema, which would surface as a server
 * error. The three kinds stay separate: each cursor schema is a strict object,
 * so a review cursor can never decode as a public cursor or vice versa.
 */
export function referenceReviewCursorFromQuery(value: string | undefined): string | null {
  return cursorFromQuery(value, referenceReviewListCursorSchema);
}

export function domainAuthorityReviewCursorFromQuery(value: string | undefined): string | null {
  return cursorFromQuery(value, domainAuthorityReviewListCursorSchema);
}

export function publicReferenceCursorFromQuery(value: string | undefined): string | null {
  return cursorFromQuery(value, publicProjectReferenceCursorSchema);
}

function cursorFromQuery(
  value: string | undefined,
  schema: { safeParse(input: unknown): { success: boolean } },
): string | null {
  if (value === undefined) {
    return null;
  }
  return schema.safeParse(value).success ? value : null;
}
