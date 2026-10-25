import type {
  BibliographicCatalogPort,
  CatalogPage,
  CatalogQuery,
  CatalogUnavailable,
} from '@pick-a-book/bibliography-domain';
import { StubBibliographicCatalogAdapter } from '@pick-a-book/bibliography-infrastructure';
import type { Result } from '@pick-a-book/shared-result';

/** The stub catalogue, with a count of the queries it was sent. */
export class CountingCatalog implements BibliographicCatalogPort {
  private readonly inner = new StubBibliographicCatalogAdapter();
  readonly name = this.inner.name;
  queries = 0;

  async search(
    query: CatalogQuery,
    signal: AbortSignal,
  ): Promise<Result<CatalogPage, CatalogUnavailable>> {
    this.queries += 1;
    return this.inner.search(query, signal);
  }
}
