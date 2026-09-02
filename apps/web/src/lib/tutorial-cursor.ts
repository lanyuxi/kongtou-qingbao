import {
  publicTutorialCursorSchema,
  tutorialCandidateCursorSchema,
  tutorialReviewCursorSchema,
  type TutorialCandidateCursor,
  type TutorialReviewCursor,
} from '@airdrop/contracts';

/**
 * Tutorials carry structured cursors in the repository layer and opaque
 * base64url tokens on the wire. Decoding validates the payload against the
 * contract cursor schemas, so a hostile or stale token fails as a client
 * paging mistake (invalid_cursor) instead of reaching a repository schema.
 */
export function encodeTutorialCandidateCursor(cursor: TutorialCandidateCursor): string {
  return encode(cursor);
}

export function encodeTutorialReviewCursor(cursor: TutorialReviewCursor): string {
  return encode(cursor);
}

export function encodePublicTutorialCursor(
  cursor: { readonly publishedAt: string; readonly tutorialId: string },
): string {
  return encode(cursor);
}

export function decodeTutorialCandidateCursor(
  value: string | undefined,
): TutorialCandidateCursor | null | 'invalid' {
  return decode(value, tutorialCandidateCursorSchema);
}

export function decodeTutorialReviewCursor(
  value: string | undefined,
): TutorialReviewCursor | null | 'invalid' {
  return decode(value, tutorialReviewCursorSchema);
}

export function decodePublicTutorialCursor(
  value: string | undefined,
): { readonly publishedAt: string; readonly tutorialId: string } | null | 'invalid' {
  return decode(value, publicTutorialCursorSchema);
}

function encode(cursor: Readonly<Record<string, string>>): string {
  return globalThis.btoa(JSON.stringify(cursor))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function decode<T>(
  value: string | undefined,
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
): T | null | 'invalid' {
  if (value === undefined) return null;
  try {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(globalThis.atob(`${value}${padding}`), (character) =>
          character.charCodeAt(0),
        ),
      ),
    );
    const result = schema.safeParse(parsed);
    return result.success ? result.data : 'invalid';
  } catch {
    return 'invalid';
  }
}
