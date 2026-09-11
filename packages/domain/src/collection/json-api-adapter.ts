import {
  DEFILLAMA_CHAIN_TVL_URL_PREFIX,
  isDefiLlamaChainSlug,
  parseDefiLlamaChainTvl,
} from './chain-json-adapter.js';
import type { JsonApiEntry } from './json-api-entry.js';

export type { JsonApiEntry } from './json-api-entry.js';

/**
 * JSON API adapters turn a structured API response into the same flat entry list
 * the Feed parser produces, so the rest of the collection pipeline — raw item
 * storage, discoveries, evidence, extraction — is shared unchanged.
 *
 * Two rules keep this safe:
 *
 * 1. Selection is an allowlist keyed by the source's *configured* URL. An
 *    unregistered JSON source is rejected rather than guessed at.
 * 2. An adapter is a pure function of the response body. It may only read fields
 *    the API actually returned; it must never synthesise a project fact, a link,
 *    or a quote the payload does not contain.
 */
export interface JsonApiAdapter {
  /** Stable identifier, surfaced in logs and tests. */
  readonly id: string;
  /** Parses one response body. Pure: same input, same output. */
  readonly parse: (body: unknown) => readonly JsonApiEntry[];
}

/**
 * Returns the adapter that owns this configured source URL, or null.
 *
 * Null is the fail-closed answer and the caller must treat it as a rejected
 * source, not as "no entries". Adding a JSON source therefore requires an
 * explicit code change plus a deployment — which is the point: every API has its
 * own field names, and an unknown payload must never be interpreted on a hunch.
 */
export function selectJsonApiAdapter(canonicalUrl: string): JsonApiAdapter | null {
  if (canonicalUrl.startsWith(DEFILLAMA_CHAIN_TVL_URL_PREFIX)) {
    const chain = canonicalUrl.slice(DEFILLAMA_CHAIN_TVL_URL_PREFIX.length);
    if (!isDefiLlamaChainSlug(chain)) return null;
    return {
      id: `defillama-chain-tvl:${chain}`,
      parse: (body) => parseDefiLlamaChainTvl(chain, body),
    };
  }

  return null;
}
