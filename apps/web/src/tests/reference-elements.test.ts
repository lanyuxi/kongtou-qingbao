import type {
  PublicProjectDomainAuthority,
  PublicProjectReference,
  SecurityPosture,
} from '@airdrop/contracts';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  GrantedDomainChips,
  OfficialWebsiteLink,
  resolveOfficialWebsite,
  VerifiedReferenceLinks,
} from '../components/reference-elements.js';

const projectId = 'd1000000-0000-4000-8000-000000000001';
const referenceId = 'd1000000-0000-4000-8000-000000000011';
const authorityId = 'd1000000-0000-4000-8000-000000000021';
const verifiedAt = '2026-08-30T04:00:00.000Z';

const verifiedReference: PublicProjectReference = {
  projectId,
  referenceId,
  kind: 'official_site',
  label: '官方网站',
  url: 'https://example.com/',
  lastVerifiedAt: verifiedAt,
};
const grantedAuthority: PublicProjectDomainAuthority = {
  projectId,
  authorityId,
  domain: 'example.com',
  grantedAt: '2026-08-30T02:00:00.000Z',
};

describe('resolveOfficialWebsite', () => {
  it('matches the stored URL only through the shared normalization function', () => {
    expect(resolveOfficialWebsite([verifiedReference], 'https://example.com')).toEqual(verifiedReference);
    expect(resolveOfficialWebsite([verifiedReference], 'https://example.com/')).toEqual(verifiedReference);
    expect(resolveOfficialWebsite([verifiedReference], 'https://EXAMPLE.com')).toEqual(verifiedReference);
    expect(resolveOfficialWebsite([verifiedReference], 'https://example.com:443')).toEqual(verifiedReference);

    // www is a separate authority and must not silently verify against the bare host.
    expect(resolveOfficialWebsite([verifiedReference], 'https://www.example.com')).toBeNull();
    expect(resolveOfficialWebsite([verifiedReference], 'http://example.com')).toBeNull();
    expect(resolveOfficialWebsite([verifiedReference], 'https://example.com/claim')).toBeNull();
    expect(resolveOfficialWebsite([verifiedReference], 'https://other.example/')).toBeNull();
    expect(resolveOfficialWebsite([verifiedReference], null)).toBeNull();
    expect(resolveOfficialWebsite([], 'https://example.com')).toBeNull();
  });

  it('never returns a reference whose own URL cannot be normalized', () => {
    expect(resolveOfficialWebsite([{ ...verifiedReference, url: 'javascript:alert(1)' }], 'javascript:alert(1)')).toBeNull();
  });
});

describe('OfficialWebsiteLink', () => {
  it('renders the anchor with the same shape the pre-verification link used while the reference is verified', () => {
    const html = renderToStaticMarkup(
      createElement(OfficialWebsiteLink, {
        url: 'https://example.com',
        references: [verifiedReference],
        posture: 'clear' satisfies SecurityPosture,
      }),
    );

    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('未验证');
  });

  it('renders inert marked text with no anchor when no verified reference matches', () => {
    const html = renderToStaticMarkup(
      createElement(OfficialWebsiteLink, {
        url: 'https://example.com',
        references: [],
        posture: 'clear' satisfies SecurityPosture,
      }),
    );

    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
    expect(html).toContain('未验证');
  });

  it('renders no link at all while the project is blocked even when the reference is verified', () => {
    const html = renderToStaticMarkup(
      createElement(OfficialWebsiteLink, {
        url: 'https://example.com',
        references: [verifiedReference],
        posture: 'blocked' satisfies SecurityPosture,
      }),
    );

    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
    expect(html).toContain('已停用');
  });

  it('renders nothing when the project has no registered website', () => {
    expect(
      renderToStaticMarkup(
        createElement(OfficialWebsiteLink, {
          url: null,
          references: [verifiedReference],
          posture: 'clear' satisfies SecurityPosture,
        }),
      ),
    ).toBe('');
  });
});

describe('VerifiedReferenceLinks', () => {
  it('renders verified references as anchors carrying last verified time and a safe rel', () => {
    const html = renderToStaticMarkup(
      createElement(VerifiedReferenceLinks, {
        references: [verifiedReference],
        posture: 'clear' satisfies SecurityPosture,
      }),
    );

    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('官方网站');
    // The exact verification instant stays machine readable; the visible copy
    // uses the shared date formatter. React keeps the camelCase `dateTime`
    // attribute in server-rendered markup.
    expect(html).toContain(`dateTime="${verifiedAt}"`);
    expect(html).toContain('2026-08-30');
  });

  it('renders no reference links while the project is blocked', () => {
    const html = renderToStaticMarkup(
      createElement(VerifiedReferenceLinks, {
        references: [verifiedReference],
        posture: 'blocked' satisfies SecurityPosture,
      }),
    );

    expect(html).toBe('');
    expect(html).not.toContain('<a');
  });

  it('renders nothing when the project has no verified references', () => {
    expect(
      renderToStaticMarkup(
        createElement(VerifiedReferenceLinks, {
          references: [],
          posture: 'clear' satisfies SecurityPosture,
        }),
      ),
    ).toBe('');
  });

  it('keeps a hostile reference label inert instead of rendering executable markup', () => {
    const html = renderToStaticMarkup(
      createElement(VerifiedReferenceLinks, {
        references: [{
          ...verifiedReference,
          label: '<script>alert(1)</script>',
        }],
        posture: 'clear' satisfies SecurityPosture,
      }),
    );

    // The public page must still show the label, so this asserts escaping
    // rather than withholding: the markup is present as inert text.
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="https://example.com/"');
  });
});

describe('GrantedDomainChips', () => {
  it('renders a granted domain as a chip and never as a link', () => {
    const html = renderToStaticMarkup(
      createElement(GrantedDomainChips, {
        authorities: [grantedAuthority],
        posture: 'clear' satisfies SecurityPosture,
      }),
    );

    expect(html).toContain('example.com');
    expect(html).toContain('已认证域名');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
  });

  it('renders no domain chips while the project is blocked', () => {
    expect(
      renderToStaticMarkup(
        createElement(GrantedDomainChips, {
          authorities: [grantedAuthority],
          posture: 'blocked' satisfies SecurityPosture,
        }),
      ),
    ).toBe('');
  });

  it('renders nothing when the project has no granted domains', () => {
    expect(
      renderToStaticMarkup(
        createElement(GrantedDomainChips, {
          authorities: [],
          posture: 'clear' satisfies SecurityPosture,
        }),
      ),
    ).toBe('');
  });
});

describe('domain package client boundary', () => {
  it('keeps @airdrop/domain out of client components so node builtins stay server-side', () => {
    // These components import normalizeReferenceUrl from @airdrop/domain, whose
    // package root also re-exports intelligence/evidence-grounding, and that
    // module imports node:crypto. That is fine while reference resolution runs
    // in server components, but a single client import would drag a Node
    // builtin into the browser bundle and break the build. The boundary is
    // invisible at the import site, so it is asserted here instead.
    expect(clientModulesImportingDomain()).toEqual([]);
  });
});

function clientModulesImportingDomain(): readonly string[] {
  const sourceRoot = join(fileURLToPath(new URL('../..', import.meta.url)), 'src');
  const offenders: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx)$/u.test(entry.name) || entry.name.includes('.test.')) continue;
      const source = readFileSync(path, 'utf8');
      if (!/^\s*['"]use client['"]/u.test(source)) continue;
      if (source.includes("from '@airdrop/domain")) {
        offenders.push(relative(sourceRoot, path));
      }
    }
  };
  walk(sourceRoot);

  return offenders;
}
