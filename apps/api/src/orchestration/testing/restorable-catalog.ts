import {
  CatalogUnavailable,
  type BibliographicCatalogPort,
  type CatalogPage,
  type CatalogQuery,
} from '@pick-a-book/bibliography-domain';
import { StubBibliographicCatalogAdapter } from '@pick-a-book/bibliography-infrastructure';
import { err, type Result } from '@pick-a-book/shared-result';

/** The stub catalogue, down until it is restored. */
export class RestorableCatalog implements BibliographicCatalogPort {
  private readonly inner = new StubBibliographicCatalogAdapter();
  readonly name = this.inner.name;
  down = true;

  async search(
    query: CatalogQuery,
    signal: AbortSignal,
  ): Promise<Result<CatalogPage, CatalogUnavailable>> {
    return this.down
      ? err(new CatalogUnavailable('unavailable'))
      : this.inner.search(query, signal);
  }
}
