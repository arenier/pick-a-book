import type { Result } from '@pick-a-book/shared-result';

import type { AuthorityId } from './authority-id.js';
import type { CatalogUnavailable } from './catalog-unavailable.error.js';

export const AUTHORITY_PORT = 'AuthorityPort';

/**
 * Outbound port to the authority records of the catalogue (research §5.4).
 *
 * Asked only when a title matches and the author does not. A failure here is not « not
 * verified »: the record is simply discarded, as before the authorities.
 */
export interface AuthorityPort {
  /** The rejected forms of an author's name: transliterations, pseudonyms, variants. */
  rejectedForms(
    id: AuthorityId,
    signal: AbortSignal,
  ): Promise<Result<readonly string[], CatalogUnavailable>>;
}
