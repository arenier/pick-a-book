import type { NotVerifiedCause } from './not-verified-cause.js';

/** Why the catalogue gave nothing usable: it did not answer, or answered off-contract. */
export type CatalogUnavailableCause = Exclude<NotVerifiedCause, 'timeout'>;

/**
 * The catalogue could not be asked, or its answer could not be trusted (ADR 0014: the call is
 * critical). An expected failure of the ports, returned and never thrown (ADR 0013): the book
 * becomes « not verified », never « not found ».
 */
export class CatalogUnavailable extends Error {
  readonly kind = 'catalog-unavailable';

  constructor(override readonly cause: CatalogUnavailableCause) {
    super(`Catalog unavailable: ${cause}`);
    this.name = 'CatalogUnavailable';
  }
}
