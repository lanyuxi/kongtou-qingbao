import {
  publicTutorialDetailSchema,
  publicTutorialListItemSchema,
  publicTutorialListQuerySchema,
  publicTutorialListSchema,
  type PublicTutorialDetail,
  type PublicTutorialListItem,
} from '@airdrop/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../generated/database.types.js';

// These selections are the whole public contract. Adding a column here widens
// what anonymous readers receive, so it must be reviewed as a leak, not as a
// convenience. Needs-review, blocked, and retired rows are filtered by the
// views themselves; the repository never re-reads a base table to second-guess
// that decision. Link URLs arrive ledger-resolved and are nulled by the view
// when a reference is not renderable; the repository additionally refuses any
// row that still carries a url for an unrenderable link.
const tutorialListSelection =
  'tutorial_id,project_id,kind,title,summary,version,last_verified_at,published_at,step_count';
const tutorialListRowKeys = [
  'kind',
  'last_verified_at',
  'project_id',
  'published_at',
  'step_count',
  'summary',
  'title',
  'tutorial_id',
  'version',
];
const tutorialDetailRowKeys = [
  'kind',
  'last_verified_at',
  'link_label',
  'link_last_verified_at',
  'link_reference_id',
  'link_renderable',
  'link_url',
  'ordinal',
  'project_id',
  'published_at',
  'step_body',
  'step_title',
  'summary',
  'title',
  'tutorial_id',
  'version',
];

export interface PublicTutorialListQuery {
  readonly projectId: string;
  readonly cursor: { readonly publishedAt: string; readonly tutorialId: string } | null;
  readonly limit?: number;
}

export interface TutorialPublicRepository {
  listProjectTutorials(input: PublicTutorialListQuery): Promise<{
    version: 1;
    items: readonly PublicTutorialListItem[];
    nextCursor: { readonly publishedAt: string; readonly tutorialId: string } | null;
  }>;
  getTutorial(input: { readonly tutorialId: string }): Promise<PublicTutorialDetail>;
}

const tutorialDetailSelection =
  'tutorial_id,project_id,kind,title,summary,version,last_verified_at,published_at,ordinal,step_title,step_body,link_reference_id,link_url,link_label,link_last_verified_at,link_renderable';

export function createTutorialPublicRepository(
  client: SupabaseClient<Database>,
): TutorialPublicRepository {
  return {
    async listProjectTutorials(input) {
      const limit = input.limit ?? 12;
      const query = publicTutorialListQuerySchema.parse({
        projectId: input.projectId,
        cursor: input.cursor,
        limit,
      });
      const base = client
        .from('public_project_tutorials')
        .select(tutorialListSelection)
        .eq('project_id', query.projectId)
        .order('published_at', { ascending: false })
        .order('tutorial_id', { ascending: false });
      const response = query.cursor === null
        ? await base.range(0, query.limit)
        : await base
            .or(
              `published_at.lt.${query.cursor.publishedAt},and(published_at.eq.${query.cursor.publishedAt},tutorial_id.lt.${query.cursor.tutorialId})`,
            )
            .range(0, query.limit);

      if (response.error !== null) {
        throw new TutorialPublicProjectionQueryError(response.error.code);
      }

      const rows = (response.data ?? []).map((row) => parseTutorialListRow(row, query.projectId));
      const items = rows.slice(0, query.limit);
      const finalItem = items.at(-1);
      const page = publicTutorialListSchema.parse({
        items,
      });
      return {
        version: 1,
        items: page.items,
        nextCursor:
          rows.length > query.limit && finalItem !== undefined
            ? { publishedAt: finalItem.publishedAt, tutorialId: finalItem.tutorialId }
            : null,
      };
    },

    async getTutorial(input) {
      const response = await client
        .from('public_tutorial_detail')
        .select(tutorialDetailSelection)
        .eq('tutorial_id', input.tutorialId);

      if (response.error !== null) {
        throw new TutorialPublicProjectionQueryError(response.error.code);
      }
      const rows = response.data ?? [];
      if (rows.length === 0) {
        throw new TutorialPublicProjectionQueryError('tutorial_not_found');
      }
      return foldTutorialDetailRows(rows);
    },
  };
}

export class TutorialPublicProjectionQueryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super('Unable to read public tutorials.');
    this.name = 'TutorialPublicProjectionQueryError';
    this.code = code;
  }
}

function parseTutorialListRow(
  value: unknown,
  projectId: string,
): PublicTutorialListItem {
  if (!isRecordWithExactKeys(value, tutorialListRowKeys)) {
    throw new TypeError('Public tutorial projection returned unsafe fields.');
  }
  if (value.project_id !== projectId) {
    throw new TypeError('Public tutorial projection returned a row outside the requested project.');
  }
  return publicTutorialListItemSchema.parse({
    tutorialId: value.tutorial_id,
    projectId: value.project_id,
    kind: value.kind,
    title: value.title,
    summary: value.summary,
    version: value.version,
    lastVerifiedAt: value.last_verified_at,
    publishedAt: value.published_at,
    stepCount: value.step_count,
  });
}

function foldTutorialDetailRows(rows: readonly unknown[]): PublicTutorialDetail {
  const unsafe = () => new TypeError('Public tutorial detail projection returned unsafe fields.');

  const first = rows[0];
  if (!isRecordWithExactKeys(first, tutorialDetailRowKeys)) throw unsafe();
  const head = first;
  if (head.project_id === null || typeof head.project_id !== 'string') throw unsafe();

  type FoldedLink = {
    readonly referenceId: unknown;
    readonly url: unknown;
    readonly label: unknown;
    readonly lastVerifiedAt: unknown;
    readonly renderable: unknown;
  };
  const stepsByOrdinal = new Map<number, { title: unknown; body: unknown; links: FoldedLink[] }>();

  for (const row of rows) {
    if (!isRecordWithExactKeys(row, tutorialDetailRowKeys)) throw unsafe();
    if (
      row.tutorial_id !== head.tutorial_id
      || row.project_id !== head.project_id
      || row.ordinal === null
      || typeof row.ordinal !== 'number'
    ) {
      throw unsafe();
    }
    const ordinal = row.ordinal;
    const step = stepsByOrdinal.get(ordinal) ?? {
      title: row.step_title,
      body: row.step_body,
      links: [] as FoldedLink[],
    };
    if (step.title !== row.step_title || step.body !== row.step_body) throw unsafe();

    if (row.link_reference_id !== null) {
      // A not-renderable link must arrive with a null url: the view nulls it.
      // Refusing the row here keeps a view regression from leaking a flagged
      // reference url through the public projection.
      if (row.link_renderable !== true && row.link_url !== null) {
        throw new TypeError(
          'Public tutorial detail projection leaked the url of an unrenderable reference.',
        );
      }
      step.links.push({
        referenceId: row.link_reference_id,
        url: row.link_renderable === true ? row.link_url : null,
        label: row.link_label,
        lastVerifiedAt: row.link_last_verified_at,
        renderable: row.link_renderable,
      });
    }
    stepsByOrdinal.set(ordinal, step);
  }

  const ordinals = [...stepsByOrdinal.keys()].sort((left, right) => left - right);
  return publicTutorialDetailSchema.parse({
    tutorialId: head.tutorial_id,
    projectId: head.project_id,
    kind: head.kind,
    title: head.title,
    summary: head.summary,
    version: head.version,
    lastVerifiedAt: head.last_verified_at,
    publishedAt: head.published_at,
    steps: ordinals.map((ordinal) => {
      const step = stepsByOrdinal.get(ordinal);
      if (step === undefined) throw unsafe();
      return {
        ordinal,
        title: step.title,
        body: step.body,
        links: step.links,
      };
    }),
  });
}

function isRecordWithExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length
    && keys.every((key, index) => key === [...expectedKeys].sort()[index])
  );
}
