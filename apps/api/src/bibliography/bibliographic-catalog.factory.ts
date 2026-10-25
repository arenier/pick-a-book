import type { AuthorityPort, BibliographicCatalogPort } from '@pick-a-book/bibliography-domain';
import {
  BnfAuthorityAdapter,
  BnfSruCatalogAdapter,
  OfflineBibliographicCatalogAdapter,
  StubAuthorityAdapter,
  StubBibliographicCatalogAdapter,
} from '@pick-a-book/bibliography-infrastructure';

import type { BibliographicCatalogConfiguration } from '../config/bibliographic-catalog-provider';

/** The two ports a catalogue answers: the search of records, and the authorities of its authors. */
export interface BibliographicCatalogs {
  readonly catalog: BibliographicCatalogPort;
  readonly authorities: AuthorityPort;
}

/**
 * Turns the validated configuration into the adapters that judge the books.
 *
 * Lives in the composition root, the only place allowed to know `bibliography-infrastructure`
 * (ADR 0002). The use cases are handed ports and cannot tell which catalogue is behind them.
 * Guards ending on the stub, like the scanner's factory: `bibliographic-catalog.factory.spec.ts`
 * asserts the binding of each provider by name.
 */
export function createBibliographicCatalog(
  configuration: BibliographicCatalogConfiguration,
): BibliographicCatalogs {
  if (configuration.provider === 'bnf') {
    return { catalog: new BnfSruCatalogAdapter(), authorities: new BnfAuthorityAdapter() };
  }

  if (configuration.provider === 'offline') {
    const offline = new OfflineBibliographicCatalogAdapter();
    return { catalog: offline, authorities: offline };
  }

  return {
    catalog: new StubBibliographicCatalogAdapter(),
    authorities: new StubAuthorityAdapter(),
  };
}
