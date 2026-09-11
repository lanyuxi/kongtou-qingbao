import { describe, expect, it } from 'vitest';

import { collectionContentKindSchema, collectionOutcomeSchema } from '@airdrop/contracts';

import { Constants } from '../generated/database.types.js';

/**
 * The generated database types and the shared contracts describe the same enums,
 * and nothing at build time compares them.
 *
 * That gap is not hypothetical. The collector's body-fetch budget drifted from
 * the contract bound and from the database check constraint, and a whole
 * collection batch was silently discarded before anyone noticed. A migration
 * that adds an enum value without re-running `pnpm db:types` produces the same
 * class of silent divergence.
 *
 * These assertions turn that divergence into a test failure. If one fails after
 * a migration, the generated file is stale: re-run `pnpm db:types`.
 */
describe('generated database enums stay aligned with the contracts', () => {
  it('collection_content_kind mirrors the contract enum exactly, in order', () => {
    // A closed set that exists in both places for the same purpose, so equality
    // is the right assertion: a value in one and not the other is always a bug.
    expect(Constants.public.Enums.collection_content_kind).toEqual([
      ...collectionContentKindSchema.options,
    ]);
  });

  it('every persistable collection_outcome is one the contract accepts', () => {
    // Deliberately a subset check, not equality. The contract enum also carries
    // `security_blocked`, which the collector returns without writing an attempt
    // row, so it must never appear in the column's type.
    const contractOutcomes = new Set<string>(collectionOutcomeSchema.options);
    const unpersistable = Constants.public.Enums.collection_outcome.filter(
      (outcome) => !contractOutcomes.has(outcome),
    );

    expect(unpersistable).toEqual([]);
    expect(Constants.public.Enums.collection_outcome).not.toContain('security_blocked');
  });
});
