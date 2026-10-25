import {
  CatalogName,
  CatalogUnavailable,
  type AuthorityId,
  type AuthorityPort,
  type BibliographicCatalogPort,
  type CatalogPage,
  type CatalogQuery,
} from '@pick-a-book/bibliography-domain';
import { err, unwrap, type Result } from '@pick-a-book/shared-result';

/**
 * A catalogue that is always unavailable, for search and authorities alike. It lets a developer
 * see the « not verified » status and the retry button by restarting the API with
 * `BIBLIOGRAPHIC_CATALOG_PROVIDER=offline` — without waiting for the BnF to be down.
 */
export class OfflineBibliographicCatalogAdapter implements BibliographicCatalogPort, AuthorityPort {
  readonly name = unwrap(CatalogName.of('offline'));

  async search(
    _query: CatalogQuery,
    _signal: AbortSignal,
  ): Promise<Result<CatalogPage, CatalogUnavailable>> {
    return err(new CatalogUnavailable('unavailable'));
  }

  async rejectedForms(
    _id: AuthorityId,
    _signal: AbortSignal,
  ): Promise<Result<readonly string[], CatalogUnavailable>> {
    return err(new CatalogUnavailable('unavailable'));
  }
}
