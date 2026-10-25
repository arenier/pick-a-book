/**
 * Which catalogue judges the detected books (specs/003-bibliographic-reconciliation,
 * research §12): `bnf` in production, `stub` by default so that a fresh checkout boots with no
 * network, `offline` to see « not verified » and the retry button.
 *
 * A discriminated union, like the shelf scanner: a provider that needs a key will carry it in
 * its own member the day one exists, and the shape will never allow a provider without it.
 */
export type BibliographicCatalogProvider = 'bnf' | 'stub' | 'offline';

export type BibliographicCatalogConfiguration = { readonly provider: BibliographicCatalogProvider };

const PROVIDERS: readonly BibliographicCatalogProvider[] = ['bnf', 'stub', 'offline'];

/** A value that is not one of the three is added to `problems`, with the accepted ones. */
export function readBibliographicCatalog(
  raw: string | undefined,
  problems: string[],
): BibliographicCatalogConfiguration {
  const value = raw ?? 'stub';
  const provider = PROVIDERS.find((candidate) => candidate === value);
  if (provider === undefined) {
    problems.push(
      `BIBLIOGRAPHIC_CATALOG_PROVIDER is "${value}" — expected one of ${PROVIDERS.join(', ')}`,
    );
    // The fallback never escapes: a non-empty `problems` throws before the caller returns.
    return { provider: 'stub' };
  }

  return { provider };
}
