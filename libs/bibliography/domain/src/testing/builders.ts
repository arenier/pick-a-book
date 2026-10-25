import { unwrap } from '@pick-a-book/shared-result';

import { CatalogRecord, type CatalogRecordInput } from '../lib/catalog-record.js';
import { MatchScore } from '../lib/match-score.js';
import type { MatchOutcome, ScoredRecord } from '../lib/match-outcome.js';
import { ReadBook } from '../lib/read-book.js';
import { ScanRef } from '../lib/scan-ref.js';
import { ShelfBookRef } from '../lib/shelf-book-ref.js';

/**
 * Builders for the specs of every layer: a record, a scored record, an outcome, a book. Not part
 * of the production build, and they `unwrap` freely — a spec builds its fixtures that way.
 */
export const A_SCAN_REF = '0e1d6d5c-0b5e-4f5b-8f5b-3c8d3b7a9a11';

export function aBookRef(position = 0, scanRef = A_SCAN_REF): ShelfBookRef {
  return unwrap(ShelfBookRef.of(unwrap(ScanRef.of(scanRef)), position));
}

export function aRecord(
  overrides: Partial<CatalogRecordInput> & { readonly title?: string } = {},
): CatalogRecord {
  const id = overrides.id ?? `ark:/12148/cb${Math.abs(hash(overrides.title ?? 'La peste'))}`;

  return unwrap(
    CatalogRecord.of({
      id,
      title: 'La peste',
      authors: [{ name: 'Camus, Albert (1913-1960)', role: 'main' }],
      raw: '<record/>',
      format: 'unimarc',
      ...overrides,
    }),
  );
}

export function aScored(
  record: CatalogRecord,
  overrides: Partial<{
    titleScore: number;
    authorScore: number;
    score: number;
    rank: number;
    retained: boolean;
  }> = {},
): ScoredRecord {
  const titleScore = overrides.titleScore ?? 1;

  return {
    record,
    titleScore: MatchScore.fromComputed(titleScore),
    authorScore:
      overrides.authorScore === undefined
        ? undefined
        : MatchScore.fromComputed(overrides.authorScore),
    score: MatchScore.fromComputed(overrides.score ?? titleScore),
    rank: overrides.rank ?? 1,
    retained: overrides.retained ?? true,
  };
}

export function aConfirmed(record: CatalogRecord = aRecord()): MatchOutcome {
  return {
    verdict: 'confirmed',
    retained: aScored(record),
    examined: [],
    needsAuthorityCheck: [],
  };
}

export function anAmbiguous(records: readonly CatalogRecord[], partial = false): MatchOutcome {
  return {
    verdict: 'ambiguous',
    candidates: records.map((record, index) => aScored(record, { rank: index + 1 })),
    partial,
    examined: [],
    needsAuthorityCheck: [],
  };
}

export function aNotFound(): MatchOutcome {
  return { verdict: 'not_found', examined: [], needsAuthorityCheck: [] };
}

function hash(text: string): number {
  let value = 0;
  for (const char of text) {
    value = (value * 31 + (char.codePointAt(0) ?? 0)) % 1_000_000_007;
  }
  return value;
}

/** What the recognition read, built for the specs. */
export function aReading(title: string, author?: string): ReadBook {
  return unwrap(ReadBook.of(title, author));
}

/**
 * A record by its identifier, its title and its main authors (« Family, Given »), for the specs
 * of the matching rule. The identifier is `ark:/12148/{id}`.
 */
export function aWork(
  id: string,
  title: string,
  authors: readonly string[] = [],
  extra: Partial<CatalogRecordInput> = {},
): CatalogRecord {
  return aRecord({
    id: `ark:/12148/${id}`,
    title,
    authors: authors.map((name) => ({ name, role: 'main' as const })),
    ...extra,
  });
}
