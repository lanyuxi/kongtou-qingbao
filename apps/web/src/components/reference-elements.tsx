import type {
  PublicProjectDomainAuthority,
  PublicProjectReference,
  SecurityPosture,
} from '@airdrop/contracts';
import { normalizeReferenceUrl } from '@airdrop/domain';

import { formatTimestamp } from './opportunity-elements.js';

/**
 * `projects.official_website_url` is a Catalog clue, not a verified fact. It
 * becomes a link only when a verified reference normalizes to exactly the same
 * form. The application normalization is kept in step with the sql function the
 * ledger applied at registration, so a value cannot verify under one form and
 * be rendered under another; the cross-layer parity cases in
 * `packages/domain/src/references/normalize.test.ts` are what hold that true,
 * so any change to either implementation must extend them together.
 */
export function resolveOfficialWebsite(
  references: readonly PublicProjectReference[],
  officialWebsiteUrl: string | null,
): PublicProjectReference | null {
  if (officialWebsiteUrl === null) {
    return null;
  }
  const normalized = normalizeReferenceUrl(officialWebsiteUrl);
  if (normalized === null) {
    return null;
  }
  return references.find((reference) => reference.url === normalized) ?? null;
}

export function OfficialWebsiteLink({
  url,
  references,
  posture,
}: {
  readonly url: string | null;
  readonly references: readonly PublicProjectReference[];
  readonly posture: SecurityPosture;
}) {
  if (url === null) {
    return null;
  }
  if (posture === 'blocked') {
    return <span className="reference-inert">官方网站（安全封锁期间外部跳转已停用）</span>;
  }

  const reference = resolveOfficialWebsite(references, url);
  if (reference === null) {
    return (
      <span className="reference-inert">
        官方网站（未验证）
        <code className="reference-inert-value">{url}</code>
      </span>
    );
  }

  return (
    <a
      className="reference-link"
      href={reference.url}
      rel="noreferrer noopener"
      target="_blank"
    >
      官方网站 ↗
    </a>
  );
}

export function VerifiedReferenceLinks({
  references,
  posture,
}: {
  readonly references: readonly PublicProjectReference[];
  readonly posture: SecurityPosture;
}) {
  // A blocked project keeps its detail page but loses actionable outbound
  // links, so no verified reference is rendered as an anchor.
  if (posture === 'blocked' || references.length === 0) {
    return null;
  }

  return (
    <ul className="reference-link-list">
      {references.map((reference) => (
        <li className="reference-link-item" key={reference.referenceId}>
          <a
            className="reference-link"
            href={reference.url}
            rel="noreferrer noopener"
            target="_blank"
          >
            {reference.label}
          </a>
          <time className="reference-verified-at" dateTime={reference.lastVerifiedAt}>
            {`核验于 ${formatTimestamp(reference.lastVerifiedAt)}`}
          </time>
        </li>
      ))}
    </ul>
  );
}

export function GrantedDomainChips({
  authorities,
  posture,
}: {
  readonly authorities: readonly PublicProjectDomainAuthority[];
  readonly posture: SecurityPosture;
}) {
  if (posture === 'blocked' || authorities.length === 0) {
    return null;
  }

  return (
    <ul className="reference-domain-list">
      {authorities.map((authority) => (
        <li className="reference-domain" key={authority.authorityId}>
          {/* A granted domain is evidence of ownership, not a destination. */}
          <code className="reference-domain-value">{authority.domain}</code>
          <span className="reference-domain-label">已认证域名</span>
        </li>
      ))}
    </ul>
  );
}
