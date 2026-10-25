import {
  CatalogQuery,
  matchBook,
  MatchingSettings,
  ReadBook,
  type CatalogQueryInput,
} from '@pick-a-book/bibliography-domain';
import { candidatesOf } from '@pick-a-book/bibliography-domain/testing';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { StubAuthorityAdapter } from './stub-authority.adapter.js';
import { StubBibliographicCatalogAdapter } from './stub-bibliographic-catalog.adapter.js';

const signal = new AbortController().signal;
const catalog = new StubBibliographicCatalogAdapter();
const search = async (input: CatalogQueryInput) =>
  unwrap(await catalog.search(unwrap(CatalogQuery.of(input)), signal)).records;

describe('StubBibliographicCatalogAdapter', () => {
  it('is named stub', () => {
    expect(catalog.name.value).toBe('stub');
  });

  it('filters by title and by author, normalised', async () => {
    const byTitle = await search({ title: 'LES CHOSES', maxRecords: 20, format: 'full' });
    const byAuthor = await search({ author: 'perec', maxRecords: 20, format: 'light' });

    expect(byTitle.map((record) => record.title)).toStrictEqual(['Les choses']);
    expect(byAuthor.map((record) => record.title)).toStrictEqual(['Les choses']);
  });

  it('respects the number of records asked for', async () => {
    const records = await search({ title: 'La place', maxRecords: 1, format: 'full' });

    expect(records).toHaveLength(1);
  });

  it('knows nothing of a title that is nowhere', async () => {
    await expect(
      search({ title: 'Titre peu lisible', maxRecords: 20, format: 'full' }),
    ).resolves.toStrictEqual([]);
  });
});

describe('StubBibliographicCatalogAdapter, with the matching rule', () => {
  const settings = MatchingSettings.defaults();
  const authorities = new StubAuthorityAdapter();

  /** The cascade of the use case in miniature: the title alone, then the authorities if asked. */
  const verdictOf = async (title: string, author: string) => {
    const book = unwrap(ReadBook.of(title, author));
    const records = await search({ title, maxRecords: 20, format: 'full' });
    const ids = matchBook(book, records, settings).needsAuthorityCheck.flatMap(
      (check) => check.authorityIds,
    );
    const answers = await Promise.all(
      ids.map(
        async (id) => [id.value, unwrap(await authorities.rejectedForms(id, signal))] as const,
      ),
    );

    return matchBook(book, records, settings, new Map(answers)).verdict;
  };

  it("confirms the books of the stub scanner: L'Amant (two editions), Les Choses, La Place", async () => {
    await expect(verdictOf("L'Amant", 'Marguerite Duras')).resolves.toBe('confirmed');
    await expect(verdictOf('Les Choses', 'Georges Perec')).resolves.toBe('confirmed');
    await expect(verdictOf('La Place', 'Annie Ernaux')).resolves.toBe('confirmed');
  });

  it('does not find the unreadable book', async () => {
    await expect(verdictOf('Titre peu lisible', 'Auteur peu lisible')).resolves.toBe('not_found');
  });

  it("carries two editions of L'Amant and two works called La Place", async () => {
    await expect(
      search({ title: "L'Amant", maxRecords: 20, format: 'full' }),
    ).resolves.toHaveLength(2);
    await expect(
      search({ title: 'La Place', maxRecords: 20, format: 'full' }),
    ).resolves.toHaveLength(2);
  });

  it('is ambiguous on a title without author carried by two works of different authors', async () => {
    const records = await search({ title: 'La Chute', maxRecords: 20, format: 'full' });

    const outcome = matchBook(unwrap(ReadBook.of('La Chute')), records, settings);

    expect(candidatesOf(outcome)).toHaveLength(2);
  });
});
