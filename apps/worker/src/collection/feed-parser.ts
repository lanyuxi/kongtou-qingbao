import { SaxesParser, type SaxesAttributeNS, type SaxesTagNS } from 'saxes';

import type { FeedEntryCandidate, FeedParser, ParsedFeed } from './ports.js';

type FeedKind = ParsedFeed['kind'];

interface ElementFrame {
  readonly local: string;
  readonly uri: string;
  readonly base: string | null;
}

interface EntryDraft {
  externalId: string | null;
  url: string | null;
  title: string | null;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  readonly directText: Map<ElementFrame, string>;
  authorDepth: number | null;
}

const ATOM_NAMESPACE = 'http://www.w3.org/2005/Atom';
const XINCLUDE_NAMESPACE = 'http://www.w3.org/2001/XInclude';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const MAX_XML_DEPTH = 64;
const MAX_FEED_ENTRIES = 100;
const MAX_EXTERNAL_ID_LENGTH = 2_048;
const MAX_URL_LENGTH = 4_096;
const MAX_TITLE_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 10_000;
const MAX_AUTHOR_LENGTH = 500;

export class FeedParsingError extends Error {
  readonly code = 'invalid_feed';

  constructor(message = 'Feed XML is invalid or unsupported.') {
    super(message);
    this.name = 'FeedParsingError';
  }
}

export function createFeedParser(): FeedParser {
  return {
    parse(xml): ParsedFeed {
      return parseFeed(xml);
    },
  };
}

function parseFeed(xml: string): ParsedFeed {
  rejectDangerousSyntax(xml);

  const parser = new SaxesParser({ xmlns: true });
  const frames: ElementFrame[] = [];
  const entries: FeedEntryCandidate[] = [];
  let kind: FeedKind | null = null;
  let currentEntry: EntryDraft | null = null;
  let currentEntryDepth: number | null = null;
  let sourceEntryCount = 0;
  let invalidEntryCount = 0;
  let failed = false;

  const fail = (): void => {
    failed = true;
  };

  parser.on('doctype', fail);
  parser.on('error', fail);

  parser.on('opentag', (tag) => {
    if (failed) {
      return;
    }

    const depth = frames.length + 1;
    if (depth > MAX_XML_DEPTH || tag.uri === XINCLUDE_NAMESPACE) {
      fail();
      return;
    }

    const parentBase = frames.at(-1)?.base ?? null;
    const frame: ElementFrame = {
      local: tag.local,
      uri: tag.uri,
      base: resolveElementBase(attributeValue(tag, XML_NAMESPACE, 'base'), parentBase),
    };
    frames.push(frame);

    if (depth === 1) {
      kind = parseRootKind(tag);
      if (kind === null) {
        fail();
      }
      return;
    }

    if (kind === 'rss_feed' && isRssEntryStart(frames)) {
      startEntry(depth);
      return;
    }

    if (kind === 'atom_feed' && isAtomEntryStart(frames)) {
      startEntry(depth);
      return;
    }

    if (currentEntry === null || currentEntryDepth === null) {
      return;
    }

    const relativeDepth = depth - currentEntryDepth;
    if (kind === 'atom_feed' && relativeDepth === 1 && isAtom(tag, 'link')) {
      const relation = attributeValue(tag, '', 'rel')?.trim().toLowerCase() ?? 'alternate';
      if (currentEntry.url === null && relation === 'alternate') {
        currentEntry.url = parseCandidateUrl(attributeValue(tag, '', 'href'), frame.base);
      }
    }

    if (kind === 'atom_feed' && relativeDepth === 1 && isAtom(tag, 'author')) {
      currentEntry.authorDepth = depth;
    }
  });

  parser.on('text', appendText);
  parser.on('cdata', appendText);

  parser.on('closetag', () => {
    if (failed) {
      return;
    }

    const depth = frames.length;
    const frame = frames.at(-1);
    if (frame === undefined) {
      fail();
      return;
    }

    if (currentEntry !== null && currentEntryDepth !== null) {
      const relativeDepth = depth - currentEntryDepth;
      if (relativeDepth === 1) {
        captureDirectEntryField(kind, frame, currentEntry);
      } else if (
        kind === 'atom_feed' &&
        currentEntry.authorDepth !== null &&
        depth === currentEntry.authorDepth + 1 &&
        isFrameAtom(frame, 'name')
      ) {
        currentEntry.author = boundedText(
          currentEntry.directText.get(frame),
          MAX_AUTHOR_LENGTH,
        );
      }

      if (depth === currentEntryDepth) {
        finishEntry(currentEntry);
        currentEntry = null;
        currentEntryDepth = null;
      }
    }

    frames.pop();
  });

  try {
    parser.write(xml).close();
  } catch {
    failed = true;
  }

  if (failed || kind === null || frames.length !== 0) {
    throw new FeedParsingError();
  }

  return { kind, entries, invalidEntryCount };

  function startEntry(depth: number): void {
    sourceEntryCount += 1;
    currentEntryDepth = depth;
    currentEntry = {
      externalId: null,
      url: null,
      title: null,
      summary: null,
      author: null,
      publishedAt: null,
      updatedAt: null,
      directText: new Map(),
      authorDepth: null,
    };
  }

  function appendText(text: string): void {
    if (failed || currentEntry === null || currentEntryDepth === null) {
      return;
    }

    const depth = frames.length;
    const frame = frames.at(-1);
    if (frame === undefined) {
      return;
    }

    const isDirectField = depth === currentEntryDepth + 1;
    const isAtomAuthorName =
      kind === 'atom_feed' &&
      currentEntry.authorDepth !== null &&
      depth === currentEntry.authorDepth + 1 &&
      isFrameAtom(frame, 'name');
    if (!isDirectField && !isAtomAuthorName) {
      return;
    }

    currentEntry.directText.set(frame, `${currentEntry.directText.get(frame) ?? ''}${text}`);
  }

  function finishEntry(entry: EntryDraft): void {
    if (sourceEntryCount > MAX_FEED_ENTRIES) {
      return;
    }

    if (entry.externalId === null && entry.url === null) {
      invalidEntryCount += 1;
      return;
    }

    entries.push({
      externalId: entry.externalId,
      url: entry.url,
      title: entry.title,
      summary: entry.summary,
      author: entry.author,
      publishedAt: entry.publishedAt,
      updatedAt: entry.updatedAt,
    });
  }
}

function rejectDangerousSyntax(xml: string): void {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new FeedParsingError();
  }
}

function parseRootKind(tag: SaxesTagNS): FeedKind | null {
  if (tag.uri === '' && tag.local === 'rss' && attributeValue(tag, '', 'version') === '2.0') {
    return 'rss_feed';
  }
  if (isAtom(tag, 'feed')) {
    return 'atom_feed';
  }
  return null;
}

function isRssEntryStart(frames: readonly ElementFrame[]): boolean {
  const item = frames.at(-1);
  const channel = frames.at(-2);
  const rss = frames.at(-3);
  return (
    item?.uri === '' &&
    item.local === 'item' &&
    channel?.uri === '' &&
    channel.local === 'channel' &&
    rss?.uri === '' &&
    rss.local === 'rss'
  );
}

function isAtomEntryStart(frames: readonly ElementFrame[]): boolean {
  const entry = frames.at(-1);
  const feed = frames.at(-2);
  return isFrameAtom(entry, 'entry') && isFrameAtom(feed, 'feed');
}

function captureDirectEntryField(
  kind: FeedKind | null,
  frame: ElementFrame,
  entry: EntryDraft,
): void {
  const text = entry.directText.get(frame);
  if (kind === 'rss_feed' && frame.uri === '') {
    switch (frame.local) {
      case 'guid':
        entry.externalId = boundedIdentity(text, MAX_EXTERNAL_ID_LENGTH);
        break;
      case 'link':
        entry.url = parseCandidateUrl(text ?? null, frame.base);
        break;
      case 'title':
        entry.title = boundedText(text, MAX_TITLE_LENGTH);
        break;
      case 'description':
        entry.summary = boundedText(text, MAX_SUMMARY_LENGTH);
        break;
      case 'author':
        entry.author = boundedText(text, MAX_AUTHOR_LENGTH);
        break;
      case 'pubDate':
        entry.publishedAt = canonicalTimestamp(text);
        break;
    }
    return;
  }

  if (kind === 'atom_feed' && frame.uri === ATOM_NAMESPACE) {
    switch (frame.local) {
      case 'id':
        entry.externalId = boundedIdentity(text, MAX_EXTERNAL_ID_LENGTH);
        break;
      case 'title':
        entry.title = boundedText(text, MAX_TITLE_LENGTH);
        break;
      case 'summary':
        entry.summary = boundedText(text, MAX_SUMMARY_LENGTH);
        break;
      case 'published':
        entry.publishedAt = canonicalTimestamp(text);
        break;
      case 'updated':
        entry.updatedAt = canonicalTimestamp(text);
        break;
    }
  }
}

function attributeValue(tag: SaxesTagNS, uri: string, local: string): string | null {
  return (
    Object.values(tag.attributes).find(
      (attribute: SaxesAttributeNS) => attribute.uri === uri && attribute.local === local,
    )?.value ?? null
  );
}

function resolveElementBase(rawBase: string | null, parentBase: string | null): string | null {
  if (rawBase === null) {
    return parentBase;
  }
  const base = rawBase.trim();
  if (base.length === 0) {
    return parentBase;
  }
  try {
    return parentBase === null ? new URL(base).href : new URL(base, parentBase).href;
  } catch {
    return null;
  }
}

function parseCandidateUrl(value: string | null, base: string | null): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }
  try {
    const candidate = base === null ? new URL(trimmed) : new URL(trimmed, base);
    return candidate.protocol === 'https:' ? boundedUrl(candidate.href, null) : null;
  } catch {
    return null;
  }
}

function boundedUrl(value: string | undefined, base: string | null): string | null {
  const trimmed = value?.trim();
  if (
    trimmed === undefined ||
    trimmed.length === 0 ||
    codePointLength(trimmed) > MAX_URL_LENGTH
  ) {
    return null;
  }
  if (base !== null) {
    return parseCandidateUrl(trimmed, base);
  }
  return trimmed;
}

function boundedIdentity(value: string | undefined, maximumLength: number): string | null {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 && trimmed.length <= maximumLength
    ? trimmed
    : null;
}

function boundedText(value: string | undefined, maximumLength: number): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }
  return Array.from(trimmed).slice(0, maximumLength).join('');
}

function canonicalTimestamp(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (
    trimmed === undefined ||
    trimmed.length === 0 ||
    (!isValidAtomTimestampShape(trimmed) && !isValidRssTimestampShape(trimmed))
  ) {
    return null;
  }
  const milliseconds = Date.parse(trimmed);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function isValidAtomTimestampShape(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
    value,
  );
  if (match === null) {
    return false;
  }

  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = match;
  return (
    validCalendarDate(year, month, day) &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59 &&
    (offsetHour === undefined ||
      (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59))
  );
}

function isValidRssTimestampShape(value: string): boolean {
  const match = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s(0?[1-9]|[12]\d|3[01])\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(\d{2}|\d{4})\s([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s(UT|GMT|[ECMP][SD]T|[+-]\d{4})$/.exec(
    value,
  );
  if (match === null) {
    return false;
  }

  const [, weekday, dayText, monthName, yearText, hourText, minuteText, secondText, zone] =
    match;
  const month = monthName === undefined ? 0 : RSS_MONTH_INDEX[monthName] ?? 0;
  const year = parseRssYear(yearText);
  const offsetMinutes = parseRssOffset(zone);
  const milliseconds = Date.parse(value);
  if (
    year === null ||
    offsetMinutes === null ||
    !validCalendarDate(String(year), String(month), dayText) ||
    !Number.isFinite(milliseconds)
  ) {
    return false;
  }

  const local = new Date(milliseconds + offsetMinutes * 60_000);
  return (
    RSS_WEEKDAYS[local.getUTCDay()] === weekday &&
    local.getUTCFullYear() === year &&
    local.getUTCMonth() + 1 === month &&
    local.getUTCDate() === Number(dayText) &&
    local.getUTCHours() === Number(hourText) &&
    local.getUTCMinutes() === Number(minuteText) &&
    local.getUTCSeconds() === Number(secondText ?? '0')
  );
}

const RSS_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const RSS_MONTH_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  RSS_MONTHS.map((month, index) => [month, index + 1]),
);
const RSS_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const RSS_NAMED_ZONE_OFFSETS: Readonly<Record<string, number>> = {
  UT: 0,
  GMT: 0,
  EST: -5 * 60,
  EDT: -4 * 60,
  CST: -6 * 60,
  CDT: -5 * 60,
  MST: -7 * 60,
  MDT: -6 * 60,
  PST: -8 * 60,
  PDT: -7 * 60,
};

function parseRssYear(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const year = Number(value);
  if (value.length === 4) {
    return year;
  }
  return year < 50 ? 2_000 + year : 1_900 + year;
}

function parseRssOffset(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const namedOffset = RSS_NAMED_ZONE_OFFSETS[value];
  if (namedOffset !== undefined) {
    return namedOffset;
  }

  const match = /^([+-])(\d{2})(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }
  const [, sign, hourText, minuteText] = match;
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  const magnitude = hours * 60 + minutes;
  return sign === '+' ? magnitude : -magnitude;
}

function validCalendarDate(
  yearText: string | undefined,
  monthText: string | undefined,
  dayText: string | undefined,
): boolean {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isAtom(tag: SaxesTagNS, local: string): boolean {
  return tag.uri === ATOM_NAMESPACE && tag.local === local;
}

function isFrameAtom(frame: ElementFrame | undefined, local: string): boolean {
  return frame?.uri === ATOM_NAMESPACE && frame.local === local;
}
