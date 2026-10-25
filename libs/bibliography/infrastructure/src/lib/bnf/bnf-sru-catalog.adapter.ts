import {
  CatalogName,
  CatalogUnavailable,
  type BibliographicCatalogPort,
  type CatalogPage,
  type CatalogQuery,
} from '@pick-a-book/bibliography-domain';
import { err, ok, unwrap, type Result } from '@pick-a-book/shared-result';

import { getXml, withDefaults, type BnfOptions } from './bnf-http.js';
import { parseSruPage } from './sru-response.js';
import { searchUrl } from './sru-url.js';

/**
 * Searches the general catalogue of the BnF through its SRU API (ADR 0014, the only judge of the
 * reconciliation). It runs **one** query and never decides to stop: the cascade is the
 * application's. The answer is validated whole (`zod`, all or nothing); a catalogue that cannot be
 * asked or whose answer is off-contract is the `Err` the port declares, never a rejection.
 */
export class BnfSruCatalogAdapter implements BibliographicCatalogPort {
  readonly name = unwrap(CatalogName.of('bnf'));
  private readonly options: Required<BnfOptions>;

  constructor(options: BnfOptions = {}) {
    this.options = withDefaults(options);
  }

  async search(
    query: CatalogQuery,
    signal: AbortSignal,
  ): Promise<Result<CatalogPage, CatalogUnavailable>> {
    const url = searchUrl(query, this.options.baseUrl);
    if (url === undefined) {
      return ok({ records: [] });
    }

    const body = await getXml(url, signal, this.options);
    if (!body.ok) {
      return err(body.error);
    }
    const records = parseSruPage(body.value, query.format === 'full' ? 'unimarc' : 'dublin-core');

    return records.ok
      ? ok({ records: records.value })
      : err(new CatalogUnavailable('invalid_response'));
  }
}
