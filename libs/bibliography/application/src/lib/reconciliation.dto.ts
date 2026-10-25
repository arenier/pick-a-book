import type { BookReconciliation, CatalogRecord } from '@pick-a-book/bibliography-domain';

/**
 * The boundary DTOs of the context (ADR 0003): all the orchestrator of `apps/api` handles. No
 * score, catalogue, step nor cause of a « not verified » crosses them — they are kept for the
 * analysis of errors and not shown (FR-018).
 */

/** A book the recognition detected, as the orchestrator hands it over. */
export interface DetectedBookInput {
  /** The index of the book in the list of the analysis. */
  readonly position: number;
  readonly title: string;
  readonly author?: string;
}

/** The reference form of a record: what the catalogue calls the book. */
export interface ReferenceDto {
  /** The ARK for the BnF. */
  readonly recordId: string;
  readonly title: string;
  /** Main authors first, then secondary ones. */
  readonly authors: readonly string[];
}

export type BookReconciliationDto = {
  readonly position: number;
  /** What the recognition read, unchanged (FR-013). */
  readonly read: { readonly title: string; readonly author?: string };
} & (
  | {
      readonly status: 'confirmed';
      readonly reference: ReferenceDto;
      readonly confirmedBy: 'automatic' | 'user';
      /** No author was read: the weakest proof of the safety net (FR-022). */
      readonly titleOnly: boolean;
    }
  | { readonly status: 'ambiguous'; readonly candidates: readonly ReferenceDto[] }
  | { readonly status: 'not_found' }
  | { readonly status: 'not_verified' }
  /** Never tried: only a read of the kept state gives it. */
  | { readonly status: 'pending' }
);

export interface ShelfReconciliationDto {
  readonly books: readonly BookReconciliationDto[];
}

/**
 * A book for the screen: what was read, and what the reconciliation made of it. A book with no
 * aggregate at all is as pending as one that has an empty aggregate.
 */
export function toBookReconciliationDto(
  input: DetectedBookInput,
  book?: BookReconciliation,
): BookReconciliationDto {
  const base = {
    position: input.position,
    read:
      input.author === undefined
        ? { title: input.title }
        : { title: input.title, author: input.author },
  };
  const state = book?.state ?? { status: 'pending' as const };

  if (state.status === 'confirmed') {
    return {
      ...base,
      status: 'confirmed',
      confirmedBy: state.confirmedBy,
      titleOnly: input.author === undefined,
      reference: toReference(state.record),
    };
  }
  if (state.status === 'ambiguous') {
    return { ...base, status: 'ambiguous', candidates: state.candidates.map(toReference) };
  }

  return { ...base, status: state.status };
}

function toReference(record: CatalogRecord): ReferenceDto {
  const ordered = [
    ...record.authors.filter((author) => author.role === 'main'),
    ...record.authors.filter((author) => author.role === 'secondary'),
  ];

  return {
    recordId: record.id.value,
    title: record.title,
    authors: ordered.map((author) => displayName(author.name)),
  };
}

/** « Camus, Albert (1913-1960) » is shown as « Albert Camus ». */
function displayName(catalogName: string): string {
  const withoutDates = catalogName
    .replaceAll(/\([^)]*\)/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
  const comma = withoutDates.indexOf(',');
  if (comma < 0) {
    return withoutDates;
  }

  return `${withoutDates.slice(comma + 1).trim()} ${withoutDates.slice(0, comma).trim()}`.trim();
}
