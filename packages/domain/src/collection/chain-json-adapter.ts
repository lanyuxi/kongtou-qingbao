import { toJsonApiEntry, type JsonApiEntry } from './json-api-entry.js';

/**
 * DeFiLlama chain-TVL adapter.
 *
 * `/v2/historicalChainTvl/{chain}` returns the whole daily series for one chain:
 *
 *   [ { "date": 1789084800, "tvl": 49287487551 }, ... ]
 *
 * We keep only the latest point, because the product needs "what is this chain's
 * TVL now", not a 3,272-point history. The value is written into the summary so
 * the resulting signal has a quote that can be cited verbatim, and the chain
 * slug becomes the stable entry key so re-running updates in place instead of
 * appending a new discovery every pass.
 *
 * One source per chain, not one global `/v2/chains` source: the URL then carries
 * the chain, so the adapter needs no project context and the collector's
 * per-(project, source) model is preserved without widening the database
 * function that loads collection context.
 */
export const DEFILLAMA_CHAIN_TVL_URL_PREFIX = 'https://api.llama.fi/v2/historicalChainTvl/';

const CHAIN_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** 2001-09-09 — below this a "date" is not a plausible UNIX timestamp. */
const MIN_PLAUSIBLE_SECONDS = 1_000_000_000;
/** 2100-01-01 — above this it is a millisecond value or junk. */
const MAX_PLAUSIBLE_SECONDS = 4_102_444_800;
/**
 * 1e15 USD. No chain has a quadrillion dollars of TVL, and beyond 1e21
 * `String(value)` switches to exponential notation, which would break the digit
 * grouping the summary relies on. Values past this are treated as unusable.
 */
const MAX_PLAUSIBLE_USD = 1e15;

export function isDefiLlamaChainSlug(value: string): boolean {
  return CHAIN_SLUG.test(value);
}

/**
 * Parses the chain-TVL series into a single entry.
 *
 * Returns an empty list when the payload carries no usable point — the
 * fail-closed answer, which the pipeline records as a pass that discovered
 * nothing rather than inventing a metric.
 */
export function parseDefiLlamaChainTvl(chain: string, body: unknown): readonly JsonApiEntry[] {
  if (!isDefiLlamaChainSlug(chain)) return [];
  if (!Array.isArray(body)) return [];

  const latest = findLatestPoint(body);
  if (latest === null) return [];

  const asOf = formatDate(latest.dateSeconds);
  const summary =
    `DeFiLlama chain TVL for ${chain}: ${formatUsd(latest.tvl)} USD` +
    (asOf === null ? '.' : ` as of ${asOf}.`);

  const entry = toJsonApiEntry({
    externalEntryId: `defillama:chain-tvl:${chain}`,
    // The API endpoint is not a page a human would read, so the entry has no
    // link. The raw JSON body remains the traceable source of the quote.
    entryUrl: null,
    title: `DeFiLlama chain TVL — ${chain}`,
    summary,
    publishedAt: asOf === null ? null : `${asOf}T00:00:00.000Z`,
  });
  return entry === null ? [] : [entry];
}

function findLatestPoint(
  body: readonly unknown[],
): { readonly dateSeconds: number; readonly tvl: number } | null {
  // The series is chronological ascending, so scan from the end and take the
  // first point that is actually usable. A trailing placeholder row (null or
  // zero-length) must not discard the whole pass.
  for (let index = body.length - 1; index >= 0; index -= 1) {
    const row = body[index];
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const tvl = record.tvl;
    if (typeof tvl !== 'number' || !Number.isFinite(tvl) || tvl < 0) continue;
    if (tvl > MAX_PLAUSIBLE_USD) continue;

    const rawDate = record.date;
    const dateSeconds =
      typeof rawDate === 'number' && Number.isFinite(rawDate) ? rawDate : Number.NaN;
    if (!Number.isFinite(dateSeconds)) continue;
    if (dateSeconds < MIN_PLAUSIBLE_SECONDS || dateSeconds > MAX_PLAUSIBLE_SECONDS) continue;

    return { dateSeconds, tvl };
  }
  return null;
}

/**
 * Groups digits deterministically.
 *
 * `toLocaleString` would depend on the host's ICU data, which makes a stored
 * quote differ between environments; the pipeline stores this text verbatim, so
 * the formatting has to be stable. The caller guarantees a finite, non-negative
 * value at or below `MAX_PLAUSIBLE_USD`, so `String` never switches to
 * exponential notation and the grouping pattern always applies.
 */
function formatUsd(value: number): string {
  const rounded = Math.round(value);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(dateSeconds: number): string | null {
  const milliseconds = Math.trunc(dateSeconds) * 1_000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
