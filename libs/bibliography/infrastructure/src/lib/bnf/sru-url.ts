import type { CatalogQuery } from '@pick-a-book/bibliography-domain';

/** Words the CQL parser would read as syntax; the values we send are only ever words. */
const CQL_SPECIAL = /["\\*?^]/gu;

/**
 * The URL of a search of the SRU API of the BnF (ADR 0014): printed text only
 * (`bib.doctype any "a"`), by title and/or author. A full query asks for UNIMARC, a light one for
 * Dublin Core, which is a quarter of the weight (research §6).
 *
 * `undefined` when nothing is left to ask about once the value is cleaned: the adapter then
 * answers an empty page without a request.
 */
export function searchUrl(query: CatalogQuery, baseUrl: string): string | undefined {
  const title = cleaned(query.title);
  const author = cleaned(withoutInitials(query.author));
  const clauses = [
    ...(title === '' ? [] : [`bib.title all "${title}"`]),
    ...(author === '' ? [] : [`bib.author all "${author}"`]),
  ];
  if (clauses.length === 0) {
    return undefined;
  }

  const params = new URLSearchParams({
    version: '1.2',
    operation: 'searchRetrieve',
    query: ['bib.doctype any "a"', ...clauses].join(' and '),
    maximumRecords: String(query.maxRecords),
    recordSchema: query.format === 'full' ? 'unimarcXchange' : 'dublincore',
  });

  return `${baseUrl}?${params.toString()}`;
}

/** The URL of the authority record with this number, or `undefined` if it is not a number. */
export function authorityUrl(authorityNumber: string, baseUrl: string): string | undefined {
  if (!/^\d+$/u.test(authorityNumber)) {
    return undefined;
  }
  const params = new URLSearchParams({
    version: '1.2',
    operation: 'searchRetrieve',
    query: `aut.recordid any "${authorityNumber}"`,
    maximumRecords: '1',
    recordSchema: 'unimarcxchange-anl',
  });

  return `${baseUrl}?${params.toString()}`;
}

function cleaned(text: string | undefined): string {
  return (text ?? '').replaceAll(CQL_SPECIAL, ' ').replaceAll(/\s+/gu, ' ').trim();
}

/** « D. Pennac » is searched as « Pennac »: the index holds words, and « d » is not one of them. */
function withoutInitials(author: string | undefined): string | undefined {
  return author
    ?.split(/\s+/u)
    .filter((word) => word.replaceAll(/[^\p{L}]/gu, '').length > 1)
    .join(' ');
}
