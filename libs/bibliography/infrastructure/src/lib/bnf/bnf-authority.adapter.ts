import {
  CatalogUnavailable,
  type AuthorityId,
  type AuthorityPort,
} from '@pick-a-book/bibliography-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

import { getXml, withDefaults, type BnfOptions } from './bnf-http.js';
import { parseAuthorityForms } from './sru-response.js';
import { authorityUrl } from './sru-url.js';

/**
 * The rejected forms of the name of an author, from his authority record at the BnF
 * (research §5.4): transliterations, pseudonyms, variants of the first name.
 *
 * Cached in memory, per instance: an authority changes rarely, and an answer lost at a restart is
 * asked again. Only an answer is cached — a failure is not, so the next book asks again.
 */
export class BnfAuthorityAdapter implements AuthorityPort {
  private readonly options: Required<BnfOptions>;
  private readonly cache = new Map<string, readonly string[]>();

  constructor(options: BnfOptions = {}) {
    this.options = withDefaults(options);
  }

  async rejectedForms(
    id: AuthorityId,
    signal: AbortSignal,
  ): Promise<Result<readonly string[], CatalogUnavailable>> {
    const cached = this.cache.get(id.value);
    if (cached !== undefined) {
      return ok(cached);
    }
    const url = authorityUrl(id.value, this.options.baseUrl);
    if (url === undefined) {
      // Not an authority number of the BnF: there is nothing to ask.
      return ok([]);
    }

    const body = await getXml(url, signal, this.options);
    if (!body.ok) {
      return err(body.error);
    }
    const forms = parseAuthorityForms(body.value);
    if (!forms.ok) {
      return err(new CatalogUnavailable('invalid_response'));
    }
    this.cache.set(id.value, forms.value);

    return ok(forms.value);
  }
}
