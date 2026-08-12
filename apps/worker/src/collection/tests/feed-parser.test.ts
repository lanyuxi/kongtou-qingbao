import { describe, expect, it, vi } from 'vitest';

import { createFeedParser, FeedParsingError } from '../feed-parser.js';

const externalResolver = vi.fn();
const parser = createFeedParser();

function expectInvalidFeed(xml: string): void {
  let thrown: unknown;
  try {
    parser.parse(xml);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(FeedParsingError);
  expect(thrown).toMatchObject({ code: 'invalid_feed' });
}

describe('strict Feed parser', () => {
  it('extracts bounded RSS 2.0 entry fields and canonical timestamps', () => {
    const feed = parser.parse(`
      <rss version="2.0">
        <channel>
          <item>
            <guid> urn:airdrop:first </guid>
            <link>https://official.example/first</link>
            <title> First &amp; safest </title>
            <description> Summary &lt;not markup&gt; </description>
            <author> editor@example.com </author>
            <pubDate>Wed, 21 Oct 2015 07:28:00 GMT</pubDate>
          </item>
          <item>
            <link>https://official.example/second</link>
            <title>Second</title>
          </item>
        </channel>
      </rss>
    `);

    expect(feed).toEqual({
      kind: 'rss_feed',
      entries: [
        {
          externalId: 'urn:airdrop:first',
          url: 'https://official.example/first',
          title: 'First & safest',
          summary: 'Summary <not markup>',
          author: 'editor@example.com',
          publishedAt: '2015-10-21T07:28:00.000Z',
          updatedAt: null,
        },
        {
          externalId: null,
          url: 'https://official.example/second',
          title: 'Second',
          summary: null,
          author: null,
          publishedAt: null,
          updatedAt: null,
        },
      ],
      invalidEntryCount: 0,
    });
  });

  it('extracts namespaced Atom fields and resolves links against inherited xml:base', () => {
    const feed = parser.parse(`
      <atom:feed xmlns:atom="http://www.w3.org/2005/Atom"
                 xml:base="https://official.example/releases/">
        <atom:entry xml:base="../entries/">
          <atom:id> tag:official.example,2026:first </atom:id>
          <atom:link rel="alternate" href="./first?view=full#top" />
          <atom:title>Launch &amp; rewards</atom:title>
          <atom:summary>Read &lt;carefully&gt;</atom:summary>
          <atom:author><atom:name>Alice</atom:name></atom:author>
          <atom:published>2026-08-12T08:09:10+08:00</atom:published>
          <atom:updated>2026-08-12T01:02:03Z</atom:updated>
        </atom:entry>
      </atom:feed>
    `);

    expect(feed).toEqual({
      kind: 'atom_feed',
      entries: [
        {
          externalId: 'tag:official.example,2026:first',
          url: 'https://official.example/entries/first?view=full#top',
          title: 'Launch & rewards',
          summary: 'Read <carefully>',
          author: 'Alice',
          publishedAt: '2026-08-12T00:09:10.000Z',
          updatedAt: '2026-08-12T01:02:03.000Z',
        },
      ],
      invalidEntryCount: 0,
    });
  });

  it('returns xml:base URLs only as untrusted candidates for later network validation', () => {
    const feed = parser.parse(`
      <feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://attacker.test/">
        <entry><id>entry-1</id><link href="claim" /></entry>
      </feed>
    `);

    expect(feed.entries[0]?.url).toBe('https://attacker.test/claim');
  });

  it('drops malformed timestamps instead of inventing publication dates', () => {
    const feed = parser.parse(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>entry-1</id>
          <published>not-a-date</published>
          <updated>2026-99-99T99:99:99Z</updated>
        </entry>
      </feed>
    `);

    expect(feed.entries[0]).toMatchObject({ publishedAt: null, updatedAt: null });
  });

  it('preserves deterministic document order and caps returned entries at 100', () => {
    const items = Array.from(
      { length: 105 },
      (_, index) => `<item><guid>item-${index}</guid><title>Title ${index}</title></item>`,
    ).join('');

    const feed = parser.parse(`<rss version="2.0"><channel>${items}</channel></rss>`);

    expect(feed.entries).toHaveLength(100);
    expect(feed.entries.map((entry) => entry.externalId)).toEqual(
      Array.from({ length: 100 }, (_, index) => `item-${index}`),
    );
  });

  it('counts entries without a usable bounded ID or URL as invalid', () => {
    const feed = parser.parse(`
      <rss version="2.0"><channel>
        <item><guid>   </guid><title>No identity</title></item>
        <item><guid>${'i'.repeat(2_049)}</guid><title>Oversized identity</title></item>
        <item><link>${'https://official.example/'.concat('p'.repeat(4_096))}</link></item>
        <item><guid>valid</guid></item>
      </channel></rss>
    `);

    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]?.externalId).toBe('valid');
    expect(feed.invalidEntryCount).toBe(3);
  });

  it('clamps extracted fields to persistence bounds and ignores feed content bodies', () => {
    const feed = parser.parse(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>bounded-id</id>
          <link href="https://official.example/${'p'.repeat(4_100)}" />
          <title>${'t'.repeat(510)}</title>
          <summary>${'s'.repeat(10_010)}</summary>
          <author><name>${'a'.repeat(510)}</name></author>
          <content>this is not an article body</content>
        </entry>
      </feed>
    `);

    expect(feed.entries[0]).toEqual({
      externalId: 'bounded-id',
      url: null,
      title: 't'.repeat(500),
      summary: 's'.repeat(10_000),
      author: 'a'.repeat(500),
      publishedAt: null,
      updatedAt: null,
    });
    expect(JSON.stringify(feed)).not.toContain('article body');
  });

  it('ignores nested extension fields instead of confusing them with direct Feed fields', () => {
    const feed = parser.parse(`
      <rss version="2.0" xmlns:ext="urn:example:extension"><channel><item>
        <guid>real-id</guid>
        <title>Real title <ext:metadata><title>Injected title</title></ext:metadata></title>
        <ext:guid>injected-id</ext:guid>
        <description>Real summary</description>
      </item></channel></rss>
    `);

    expect(feed.entries[0]).toMatchObject({
      externalId: 'real-id',
      title: 'Real title',
      summary: 'Real summary',
    });
  });

  it.each([
    '<rss version="2.0"><channel><item></channel></rss>',
    '<html><body>not a feed</body></html>',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" />',
    '<rss version="0.91"><channel /></rss>',
  ])('rejects malformed or unsupported XML: %s', (xml) => {
    expectInvalidFeed(xml);
  });

  it.each([
    '<!DOCTYPE rss SYSTEM "https://attacker.test/feed.dtd"><rss version="2.0" />',
    '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss>&xxe;</rss>',
    '<rss xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///etc/passwd" /></rss>',
  ])('rejects external-resource XML syntax without resolving it', (xml) => {
    expectInvalidFeed(xml);
    expect(externalResolver).not.toHaveBeenCalled();
  });

  it('rejects unresolved entities and excessive nesting', () => {
    expectInvalidFeed(
      '<rss version="2.0"><channel><item><title>&unresolved;</title></item></channel></rss>',
    );
    expectInvalidFeed(`<rss version="2.0">${'<x>'.repeat(64)}${'</x>'.repeat(64)}</rss>`);
  });

  it('rejects trailing roots and never returns a partial Feed after an error', () => {
    expectInvalidFeed('<rss version="2.0"><channel /></rss><rss version="2.0" />');
  });
});
