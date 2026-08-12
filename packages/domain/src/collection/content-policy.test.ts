import { describe, expect, it } from 'vitest';

import {
  MAX_DECOMPRESSED_BYTES,
  validateConfiguredCollectionUrl,
  type ValidatedCollectionUrl,
} from './network-policy.js';
import {
  CollectionContentPolicyError,
  createStableFeedEntryKey,
  decodeUtf8,
  decideContentStorage,
  decideFeedArticleDisposition,
  parseCollectionMediaType,
  sanitizeCollectionEtag,
  sanitizeCollectionLastModified,
  selectArticleFetches,
  selectFeedEntries,
} from './content-policy.js';

function expectPolicyError(
  action: () => unknown,
  code: CollectionContentPolicyError['code'],
): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(CollectionContentPolicyError);
  expect(thrown).toMatchObject({ code });
}

function validatedUrl(url: string): ValidatedCollectionUrl {
  return validateConfiguredCollectionUrl({
    candidateUrl: url,
    configuredUrl: url,
    authorityDomains: ['official.example'],
  });
}

describe('parseCollectionMediaType', () => {
  it.each([
    ['text/html; charset=utf-8', 'html'],
    ['TEXT/HTML; Charset="utf-8"', 'html'],
    ['application/rss+xml', 'xml'],
    ['application/atom+xml; charset=UTF-8', 'xml'],
    ['application/xml', 'xml'],
    ['text/xml', 'xml'],
  ] as const)('accepts %s as %s', (header, expected) => {
    expect(parseCollectionMediaType(header).family).toBe(expected);
  });

  it.each(['application/json', 'text/plain', 'image/svg+xml', '', null])(
    'rejects unsupported content type %s',
    (header) => {
      expectPolicyError(() => parseCollectionMediaType(header), 'unsupported_content_type');
    },
  );

  it.each([
    'text/html;',
    'text/html; charset',
    'text/html; charset=',
    'text/html; charset="unterminated',
  ])('rejects malformed media type parameters in %s', (header) => {
    expectPolicyError(() => parseCollectionMediaType(header), 'unsupported_content_type');
  });

  it('accepts RFC HTTP obs-text inside a quoted parameter', () => {
    expect(parseCollectionMediaType('text/html; note="café"')).toEqual({
      family: 'html',
      mediaType: 'text/html',
    });
  });

  it('rejects an illegal field-value control inside a quoted parameter', () => {
    expectPolicyError(
      () => parseCollectionMediaType('text/html; note="bad\u000bvalue"'),
      'unsupported_content_type',
    );
  });
});

describe('decodeUtf8', () => {
  it('decodes valid UTF-8 without changing its text', () => {
    expect(decodeUtf8(Uint8Array.from([0xe7, 0xa9, 0xba, 0xe6, 0x8a, 0x95]))).toBe('空投');
  });

  it('rejects malformed UTF-8 rather than replacing bytes', () => {
    expectPolicyError(() => decodeUtf8(Uint8Array.from([0xc3, 0x28])), 'invalid_text_encoding');
  });
});

describe('content identity and storage decision', () => {
  it('treats an exact prior SHA-256 match as unchanged content', () => {
    expect(
      decideContentStorage({
        candidateByteLength: 3,
        candidateSha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        latestSha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      }),
    ).toBe('unchanged_content');
  });

  it.each([
    [null, 'stored_new_content'],
    ['DC1114CD074914BD872CC1F9A23EC910EA2203BC79779AB2E17DA25782A624FC', 'stored_new_content'],
    ['not-a-sha256', 'stored_new_content'],
  ] as const)('stores content when the prior hash is %s', (latestSha256, expected) => {
    expect(
      decideContentStorage({
        candidateByteLength: 4,
        candidateSha256: 'dc1114cd074914bd872cc1f9a23ec910ea2203bc79779ab2e17da25782a624fc',
        latestSha256,
      }),
    ).toBe(expected);
  });

  it('accepts a body at the exact 2 MiB decompressed boundary', () => {
    expect(
      decideContentStorage({
        candidateByteLength: MAX_DECOMPRESSED_BYTES,
        candidateSha256: 'e'.repeat(64),
        latestSha256: null,
      }),
    ).toBe('stored_new_content');
  });

  it('rejects a body one byte over the 2 MiB decompressed boundary', () => {
    expectPolicyError(
      () =>
        decideContentStorage({
          candidateByteLength: MAX_DECOMPRESSED_BYTES + 1,
          candidateSha256: 'e'.repeat(64),
          latestSha256: null,
        }),
      'response_too_large',
    );
  });
});

describe('conditional response validators', () => {
  it.each(['W/"opaque-tag"', '"quoted-tag"', '  W/"spacing-is-opaque"  '])(
    'preserves an accepted ETag exactly: %s',
    (value) => {
      expect(sanitizeCollectionEtag(value)).toBe(value);
    },
  );

  it('accepts an ETag at 1,024 characters and rejects one character more', () => {
    expect(sanitizeCollectionEtag('e'.repeat(1_024))).toBe('e'.repeat(1_024));
    expect(sanitizeCollectionEtag('e'.repeat(1_025))).toBeNull();
  });

  it('preserves a non-empty Last-Modified value and applies its 128-character bound', () => {
    expect(sanitizeCollectionLastModified('Wed, 21 Oct 2015 07:28:00 GMT')).toBe(
      'Wed, 21 Oct 2015 07:28:00 GMT',
    );
    expect(sanitizeCollectionLastModified('m'.repeat(128))).toBe('m'.repeat(128));
    expect(sanitizeCollectionLastModified('m'.repeat(129))).toBeNull();
  });

  it.each([null, '', '   '])('rejects an empty validator value %s', (value) => {
    expect(sanitizeCollectionEtag(value)).toBeNull();
    expect(sanitizeCollectionLastModified(value)).toBeNull();
  });

  it.each([
    ['carriage return', 'safe\rInjected: true'],
    ['line feed', 'safe\nInjected: true'],
    ['NUL', 'safe\u0000value'],
    ['C0 control', 'safe\u000bvalue'],
    ['DEL', 'safe\u007fvalue'],
  ])('rejects %s in opaque validators', (_name, value) => {
    expect(sanitizeCollectionEtag(value)).toBeNull();
    expect(sanitizeCollectionLastModified(value)).toBeNull();
  });

  it('preserves horizontal tabs and obs-text allowed in HTTP field values', () => {
    expect(sanitizeCollectionEtag('\tW/"café"\t')).toBe('\tW/"café"\t');
    expect(sanitizeCollectionLastModified('café\tGMT')).toBe('café\tGMT');
  });
});

describe('feed entry identity and fetch disposition', () => {
  it('prefers a trimmed GUID or Atom ID and otherwise uses a normalized URL', () => {
    expect(
      createStableFeedEntryKey({
        id: ' urn:item:1 ',
        validatedUrl: validatedUrl('https://official.example/ignored'),
      }),
    ).toBe('id:urn:item:1');
    expect(
      createStableFeedEntryKey({
        id: null,
        validatedUrl: validatedUrl('https://official.example/a'),
      }),
    ).toBe('url:https://official.example/a');
    expect(createStableFeedEntryKey({ id: null, validatedUrl: null })).toBeNull();
  });

  it('falls back from an empty identifier and strips URL fragments while preserving query data', () => {
    expect(
      createStableFeedEntryKey({
        id: '   ',
        validatedUrl: validatedUrl(
          'https://official.example/a/../entry?part=1#section-two',
        ),
      }),
    ).toBe('url:https://official.example/entry?part=1');
  });

  it('accepts an identifier at 2,048 characters and falls back when it is longer', () => {
    expect(createStableFeedEntryKey({ id: 'i'.repeat(2_048), validatedUrl: null })).toBe(
      `id:${'i'.repeat(2_048)}`,
    );
    expect(
      createStableFeedEntryKey({
        id: 'i'.repeat(2_049),
        validatedUrl: validatedUrl('https://official.example/fallback'),
      }),
    ).toBe('url:https://official.example/fallback');
    expect(createStableFeedEntryKey({ id: 'i'.repeat(2_049), validatedUrl: null })).toBeNull();
  });

  it('rejects a normalized validated URL key over 4,096 characters', () => {
    expect(
      createStableFeedEntryKey({
        id: null,
        validatedUrl: validatedUrl(`https://official.example/${'p'.repeat(4_096)}`),
      }),
    ).toBeNull();
  });

  it.each([
    ['https://official.example/article', 'eligible'],
    ['https://news.official.example/article', 'eligible'],
    ['https://external.example/article', 'discovered_only'],
    ['https://official.example.attacker.test/article', 'discovered_only'],
    ['http://official.example/article', 'discovered_only'],
    ['https://official.example:443/article', 'discovered_only'],
    ['not a URL', 'discovered_only'],
  ] as const)('classifies %s as %s', (url, expected) => {
    expect(
      decideFeedArticleDisposition({ url, authorityDomains: ['official.example'] }),
    ).toBe(expected);
  });
});

describe('feed budgets', () => {
  it('limits deterministic document-order discovery to 100 and body fetches to 20', () => {
    const entries = Array.from({ length: 125 }, (_, index) => ({ index, eligible: true }));
    const discoveries = selectFeedEntries(entries);
    const fetches = selectArticleFetches(discoveries);

    expect(discoveries).toHaveLength(100);
    expect(discoveries.map(({ index }) => index)).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(fetches).toHaveLength(20);
    expect(fetches.map(({ index }) => index)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(discoveries).not.toBe(entries);
    expect(fetches).not.toBe(discoveries);
  });

  it('skips ineligible entries without disturbing eligible document order', () => {
    const entries = Array.from({ length: 45 }, (_, index) => ({
      index,
      eligible: index % 2 === 0,
    }));

    expect(selectArticleFetches(entries).map(({ index }) => index)).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38,
    ]);
  });
});
