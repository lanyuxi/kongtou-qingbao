import { z } from 'zod';

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function tutorialDetailHref(tutorialId: string): string | null {
  return uuidPattern.test(tutorialId) ? `/review/tutorials/${tutorialId}` : null;
}

export function isUuid(value: string): boolean {
  return z.uuid().safeParse(value).success;
}
