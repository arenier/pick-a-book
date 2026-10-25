import { CatalogUnavailable } from '@pick-a-book/bibliography-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

export const BNF_SRU_URL = 'https://catalogue.bnf.fr/api/SRU';

/** Identifies the project to the BnF, with no personal data (ADR 0014, `bibliography.md`). */
export const DEFAULT_USER_AGENT = 'pick-a-book (+https://github.com/arenier/pick-a-book)';

export interface BnfOptions {
  /** The transport, injected so that the specs replay recorded answers (`adapters.md`). */
  readonly fetch?: typeof fetch;
  /** Overridable by configuration; the public API of the BnF by default. */
  readonly baseUrl?: string;
  readonly userAgent?: string;
}

/** Statuses that say « try again later » rather than « your request is wrong ». */
const TRANSIENT_STATUS = new Set([408, 429]);

/**
 * `GET` of an XML answer, with the failures the ports declare as values: a network error, an
 * abort or a server error is `unavailable` (the BnF could not be asked), any other refusal is
 * `invalid_response` (what came back is not in the contract).
 */
export async function getXml(
  url: string,
  signal: AbortSignal,
  options: Required<BnfOptions>,
): Promise<Result<string, CatalogUnavailable>> {
  try {
    const response = await options.fetch(url, {
      signal,
      headers: { 'User-Agent': options.userAgent, Accept: 'application/xml' },
    });
    if (!response.ok) {
      const transient = response.status >= 500 || TRANSIENT_STATUS.has(response.status);
      return err(new CatalogUnavailable(transient ? 'unavailable' : 'invalid_response'));
    }

    return ok(await response.text());
  } catch {
    return err(new CatalogUnavailable('unavailable'));
  }
}

export function withDefaults(options: BnfOptions): Required<BnfOptions> {
  return {
    fetch: options.fetch ?? globalThis.fetch,
    baseUrl: options.baseUrl ?? BNF_SRU_URL,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
  };
}
