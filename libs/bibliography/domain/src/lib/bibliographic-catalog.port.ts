import type { Result } from '@pick-a-book/shared-result';

import type { CatalogName } from './catalog-name.js';
import type { CatalogQuery } from './catalog-query.js';
import type { CatalogRecord } from './catalog-record.js';
import type { CatalogUnavailable } from './catalog-unavailable.error.js';

/** What a query brought back, in the catalogue's own order. An empty page is « nothing found ». */
export interface CatalogPage {
  readonly records: readonly CatalogRecord[];
}

export const BIBLIOGRAPHIC_CATALOG_PORT = 'BibliographicCatalogPort';

/**
 * Outbound port to the catalogue that judges the books (ADR 0014: the BnF).
 *
 * An adapter runs **one** query and never decides to stop: the cascade is the application's. A
 * catalogue that is down, slow beyond the signal, or off-contract is not a rejected promise but
 * the `Err` the port declares — the book becomes « not verified », never « not found ».
 */
export interface BibliographicCatalogPort {
  /** Kept with each attempt (FR-017). */
  readonly name: CatalogName;
  search(
    query: CatalogQuery,
    signal: AbortSignal,
  ): Promise<Result<CatalogPage, CatalogUnavailable>>;
}
