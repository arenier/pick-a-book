import { CatalogQuery, type CatalogQueryInput } from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { authorityUrl, searchUrl } from './sru-url.js';

const BASE = 'https://catalogue.bnf.fr/api/SRU';

function urlOf(input: CatalogQueryInput) {
  return new URL(String(searchUrl(unwrap(CatalogQuery.of(input)), BASE)));
}

describe('searchUrl', () => {
  it('asks the SRU API for printed text by title and author, in UNIMARC for a full query', () => {
    const url = urlOf({
      title: 'La Peste',
      author: 'Albert Camus',
      maxRecords: 20,
      format: 'full',
    });

    expect(url.origin + url.pathname).toBe(BASE);
    expect(url.searchParams.get('operation')).toBe('searchRetrieve');
    expect(url.searchParams.get('version')).toBe('1.2');
    expect(url.searchParams.get('query')).toBe(
      'bib.doctype any "a" and bib.title all "La Peste" and bib.author all "Albert Camus"',
    );
    expect(url.searchParams.get('maximumRecords')).toBe('20');
    expect(url.searchParams.get('recordSchema')).toBe('unimarcXchange');
  });
});

describe('searchUrl, the other queries', () => {
  it('asks for Dublin Core when the query is light', () => {
    const url = urlOf({ author: 'Albert Camus', maxRecords: 100, format: 'light' });

    expect(url.searchParams.get('query')).toBe(
      'bib.doctype any "a" and bib.author all "Albert Camus"',
    );
    expect(url.searchParams.get('recordSchema')).toBe('dublincore');
    expect(url.searchParams.get('maximumRecords')).toBe('100');
  });

  it('asks by title alone', () => {
    const url = urlOf({ title: 'La Peste', maxRecords: 20, format: 'full' });

    expect(url.searchParams.get('query')).toBe('bib.doctype any "a" and bib.title all "La Peste"');
  });

  it('leaves out the initials of an author: the index holds words, not initials', () => {
    const url = urlOf({
      title: 'Chaque fois',
      author: 'D. Pennac',
      maxRecords: 20,
      format: 'full',
    });

    expect(url.searchParams.get('query')).toContain('bib.author all "Pennac"');
  });

  it('cannot break out of its quotes', () => {
    const url = urlOf({ title: 'La "Peste" \\ * ? ^', maxRecords: 20, format: 'full' });

    expect(url.searchParams.get('query')).toBe('bib.doctype any "a" and bib.title all "La Peste"');
  });

  it('asks for nothing when nothing is left to ask about', () => {
    const query = unwrap(CatalogQuery.of({ author: 'J. D.', maxRecords: 20, format: 'full' }));

    expect(searchUrl(query, BASE)).toBeUndefined();
  });
});

describe('authorityUrl', () => {
  it('asks for one authority record by its number', () => {
    const url = new URL(String(authorityUrl('11894985', BASE)));

    expect(url.searchParams.get('query')).toBe('aut.recordid any "11894985"');
    expect(url.searchParams.get('recordSchema')).toBe('unimarcxchange-anl');
    expect(url.searchParams.get('maximumRecords')).toBe('1');
  });

  it('refuses a number that is not one rather than send it', () => {
    expect(authorityUrl('11894985" or 1=1', BASE)).toBeUndefined();
    expect(authorityUrl('', BASE)).toBeUndefined();
  });
});
