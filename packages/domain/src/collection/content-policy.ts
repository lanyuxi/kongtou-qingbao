import {
  MAX_COLLECTION_BODY_FETCHES,
  MAX_COLLECTION_DISCOVERIES,
} from '@airdrop/contracts';

import {
  isWithinAuthorityDomains,
  MAX_DECOMPRESSED_BYTES,
  type ValidatedCollectionUrl,
} from './network-policy.js';

export type ContentPolicyErrorCode =
  | 'unsupported_content_type'
  | 'invalid_text_encoding'
  | 'response_too_large';

export interface CollectionMediaType {
  readonly family: 'html' | 'xml' | 'json';
  readonly mediaType: string;
}

export class CollectionContentPolicyError extends Error {
  constructor(
    readonly code: ContentPolicyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CollectionContentPolicyError';
  }
}

export interface ContentStorageInput {
  readonly candidateByteLength: number;
  readonly candidateSha256: string;
  readonly latestSha256: string | null;
}

export interface StableFeedEntryKeyInput {
  readonly id: string | null;
  readonly validatedUrl: ValidatedCollectionUrl | null;
}

export interface FeedArticleDispositionInput {
  readonly url: string;
  readonly authorityDomains: readonly string[];
}

export type FeedArticleDisposition = 'eligible' | 'discovered_only';

interface FeedEntryEligibility {
  readonly eligible: boolean;
}

const MAX_ETAG_LENGTH = 1_024;
const MAX_LAST_MODIFIED_LENGTH = 128;
const MAX_STABLE_ENTRY_ID_LENGTH = 2_048;
const MAX_STABLE_ENTRY_KEY_LENGTH = 4_096;
// Both budgets are contract constants, not local choices: the collector result
// schema bounds `discoveredCount` / `bodyFetchCount` by the very same numbers,
// and the database check constraint mirrors the body-fetch one. Raising a budget
// here alone would make a busy pass fail strict result parsing *after* it had
// already committed its rows — which is exactly the bug this replaced.
const MAX_FEED_ENTRIES = MAX_COLLECTION_DISCOVERIES;
// How many article bodies one collection pass may fetch per source.
//
// This is a wall-clock budget in disguise: each fetch is a separate HTTPS
// request, and the pass runs inside a serverless invocation. At 20, a source
// publishing more than 20 items per cycle leaves the remainder as
// body_fetch_budget_exhausted — and because a pass only fetches when the feed
// actually changed, those leftovers are not revisited until the next change,
// so a busy feed can stay permanently behind. 35 clears a typical cycle's
// worth of items while keeping the pass comfortably inside its time limit.
const MAX_ARTICLE_FETCHES = MAX_COLLECTION_BODY_FETCHES;
const TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const QUOTED_STRING = '"(?:[\\t !#-\\[\\]-~\\x80-\\xff]|\\\\[\\t -~\\x80-\\xff])*"';
const HTTP_FIELD_VALUE = /^[\t\x20-\x7e\x80-\xff]+$/;
const MEDIA_TYPE_PATTERN = new RegExp(
  `^(${TOKEN})/(${TOKEN})(?:[\\t ]*;[\\t ]*${TOKEN}[\\t ]*=[\\t ]*(?:${TOKEN}|${QUOTED_STRING}))*[\\t ]*$`,
);
const ACCEPTED_MEDIA_TYPES = new Map<string, CollectionMediaType['family']>([
  ['text/html', 'html'],
  ['application/rss+xml', 'xml'],
  ['application/atom+xml', 'xml'],
  ['application/xml', 'xml'],
  ['text/xml', 'xml'],
  // A JSON API response. Deliberately narrow: `application/ld+json`,
  // `text/json` and vendor `+json` types are not accepted, so a source can only
  // opt in by serving the exact type the collector is willing to parse.
  ['application/json', 'json'],
]);

export function parseCollectionMediaType(header: string | null): CollectionMediaType {
  const match = header === null ? null : MEDIA_TYPE_PATTERN.exec(header);
  const type = match?.[1];
  const subtype = match?.[2];
  if (type === undefined || subtype === undefined) {
    throw unsupportedContentType();
  }

  const mediaType = `${type.toLowerCase()}/${subtype.toLowerCase()}`;
  const family = ACCEPTED_MEDIA_TYPES.get(mediaType);
  if (family === undefined) {
    throw unsupportedContentType();
  }

  return { family, mediaType };
}

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new CollectionContentPolicyError(
      'invalid_text_encoding',
      'Accepted collection content must be valid UTF-8.',
    );
  }
}

export function decideContentStorage(
  input: ContentStorageInput,
): 'stored_new_content' | 'unchanged_content' {
  if (input.candidateByteLength > MAX_DECOMPRESSED_BYTES) {
    throw new CollectionContentPolicyError(
      'response_too_large',
      `Decompressed collection content must not exceed ${MAX_DECOMPRESSED_BYTES} bytes.`,
    );
  }

  return input.candidateSha256 === input.latestSha256
    ? 'unchanged_content'
    : 'stored_new_content';
}

export function sanitizeCollectionEtag(value: string | null): string | null {
  return boundedOpaqueValidator(value, MAX_ETAG_LENGTH);
}

export function sanitizeCollectionLastModified(value: string | null): string | null {
  return boundedOpaqueValidator(value, MAX_LAST_MODIFIED_LENGTH);
}

export function createStableFeedEntryKey(input: StableFeedEntryKeyInput): string | null {
  const id = input.id?.trim();
  if (id !== undefined && id.length > 0 && id.length <= MAX_STABLE_ENTRY_ID_LENGTH) {
    return `id:${id}`;
  }

  if (input.validatedUrl === null) {
    return null;
  }

  const normalizedUrl = new URL(input.validatedUrl.url);
  normalizedUrl.hash = '';

  const key = `url:${normalizedUrl.href}`;
  return key.length <= MAX_STABLE_ENTRY_KEY_LENGTH ? key : null;
}

export function decideFeedArticleDisposition(
  input: FeedArticleDispositionInput,
): FeedArticleDisposition {
  const authorityMatch = /^https:\/\/([^/?#]+)(?:[/?#]|$)/.exec(input.url);
  const authority = authorityMatch?.[1];
  if (authority === undefined || authority.includes('@') || authority.includes(':')) {
    return 'discovered_only';
  }

  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return 'discovered_only';
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.hostname !== authority ||
    !isWithinAuthorityDomains(url.hostname, input.authorityDomains)
  ) {
    return 'discovered_only';
  }

  return 'eligible';
}

export function selectFeedEntries<T>(entries: readonly T[]): readonly T[] {
  return entries.slice(0, MAX_FEED_ENTRIES);
}

export function selectArticleFetches<T extends FeedEntryEligibility>(
  entries: readonly T[],
): readonly T[] {
  const selected: T[] = [];
  for (const entry of entries) {
    if (entry.eligible) {
      selected.push(entry);
      if (selected.length === MAX_ARTICLE_FETCHES) {
        break;
      }
    }
  }
  return selected;
}

function boundedOpaqueValidator(value: string | null, maximumLength: number): string | null {
  if (
    value === null ||
    value.trim().length === 0 ||
    value.length > maximumLength ||
    !HTTP_FIELD_VALUE.test(value)
  ) {
    return null;
  }
  return value;
}

function unsupportedContentType(): CollectionContentPolicyError {
  return new CollectionContentPolicyError(
    'unsupported_content_type',
    'Collection content type is unsupported or malformed.',
  );
}
