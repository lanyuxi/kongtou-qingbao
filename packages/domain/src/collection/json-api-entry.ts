/**
 * The entry shape every JSON API adapter produces, plus the bounded constructor
 * they share.
 *
 * It is deliberately Feed-shaped: the collection pipeline stores entries as
 * discoveries, and a discovery only needs identity, a title, a quotable summary
 * and a timestamp. Entries carry no article body, so a JSON discovery is always
 * `discovered_only` and never triggers a body fetch.
 */
export interface JsonApiEntry {
  /** Stable identity within the source; becomes the discovery's stable key. */
  readonly externalEntryId: string | null;
  /**
   * A page a human could open, or null when the payload has no such page.
   *
   * NOTE: the collector currently pins every JSON discovery's `entry_url` to
   * null, because the one registered adapter (DeFiLlama chain TVL) has no
   * per-entry page and because a JSON entry is never fetched. An adapter must
   * therefore not rely on this field reaching the database yet; it is validated
   * here so that supporting display links later is a collector-side change only.
   */
  readonly entryUrl: string | null;
  readonly title: string | null;
  readonly summary: string | null;
  readonly publishedAt: string | null;
}

const MAX_ENTRY_ID_LENGTH = 2_048;
const MAX_TITLE_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_PUBLISHED_AT_LENGTH = 40;

// `discovered_items.published_at` is a timestamptz, so an adapter that produced
// a free-form date string would fail at persistence and take the whole batch
// with it. Accept only the canonical UTC instant the column can store.
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Untrusted adapter input.
 *
 * Fields are `unknown` because this is a parsing boundary: an adapter reads them
 * out of a decoded JSON body, where nothing is typed. Every field is validated
 * here rather than trusted from the caller's types.
 */
export type JsonApiEntryInput = { readonly [K in keyof JsonApiEntry]?: unknown };

/**
 * Builds one bounded entry, dropping anything the database would reject rather
 * than letting a malformed field abort the whole pass.
 *
 * Returns null when the entry has no usable identity, or when any supplied
 * field is unusable (wrong type, longer than its bound, or a timestamp the
 * database could not store). Fields are never silently truncated: a summary that
 * evidence will later cite verbatim must be stored exactly as the API returned
 * it, or not at all.
 */
export function toJsonApiEntry(input: JsonApiEntryInput): JsonApiEntry | null {
  const externalEntryId = bounded(input.externalEntryId, MAX_ENTRY_ID_LENGTH);
  const entryUrl = bounded(input.entryUrl, MAX_ENTRY_ID_LENGTH);
  const title = bounded(input.title, MAX_TITLE_LENGTH);
  const summary = bounded(input.summary, MAX_SUMMARY_LENGTH);
  const publishedAt = bounded(input.publishedAt, MAX_PUBLISHED_AT_LENGTH);

  if (externalEntryId === undefined || entryUrl === undefined) return null;
  if (title === undefined || summary === undefined || publishedAt === undefined) return null;
  if (externalEntryId === null) return null;
  if (publishedAt !== null && !UTC_INSTANT.test(publishedAt)) return null;

  return { externalEntryId, entryUrl, title, summary, publishedAt };
}

function bounded(value: unknown, maximumLength: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maximumLength) return undefined;
  return trimmed;
}
