import {
  AuthorityId,
  CatalogQuery,
  matchBook,
  MatchingSettings,
  ReadBook,
  type CatalogRecord,
  type MatchOutcome,
} from '@pick-a-book/bibliography-domain';
import { confirmedOf } from '@pick-a-book/bibliography-domain/testing';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { BnfAuthorityAdapter } from './bnf-authority.adapter.js';
import { BnfSruCatalogAdapter } from './bnf-sru-catalog.adapter.js';
import { fixture } from './testing-fixtures.js';

/**
 * The adapter and the matching rule together, on the answers the BnF really gave (the cases of
 * ADR 0014): each recorded page is read by the adapter, then judged by `matchBook` with the
 * default settings. Protects the settings of research §5 from a change that would break one case.
 */
const settings = MatchingSettings.defaults();
const read = (title: string, author?: string) => unwrap(ReadBook.of(title, author));

/** The page the adapter reads out of a recorded answer. */
async function pageOf(
  name: string,
  format: 'full' | 'light' = 'full',
): Promise<readonly CatalogRecord[]> {
  const adapter = new BnfSruCatalogAdapter({ fetch: async () => new Response(fixture(name)) });
  const query = unwrap(CatalogQuery.of({ title: 'x', maxRecords: 20, format }));

  return unwrap(await adapter.search(query, new AbortController().signal)).records;
}

async function judged(
  name: string,
  book: ReadBook,
  format: 'full' | 'light' = 'full',
): Promise<MatchOutcome> {
  return matchBook(book, await pageOf(name, format), settings);
}

function retainedTitle(outcome: MatchOutcome): string {
  return confirmedOf(outcome).record.title;
}

describe('the cases of ADR 0014, confirmed on the real answers of the BnF', () => {
  it('confirms « Percy Jackson - La Mer des Monstres » through its segment, series explained', async () => {
    const book = read('Percy Jackson - La Mer des Monstres', 'Rick Riordan');

    expect((await judged('percy-title-segment', book)).verdict).toBe('confirmed');
    expect((await judged('percy-title-whole', book)).verdict).toBe('confirmed');
  });

  it('confirms « 17 lunes » and « 18 lunes » each as itself, never as the other', async () => {
    const seventeen = await judged('lunes-17-title-and-author', read('17 lunes', 'Kami Garcia'));
    const eighteen = await judged('lunes-18-title-and-author', read('18 lunes', 'Kami Garcia'));

    expect(retainedTitle(seventeen)).toBe('17 lunes');
    expect(retainedTitle(eighteen)).toBe('18 lunes');
  });

  it('confirms the volume read of a series titled otherwise: « Éternels (tome 3) »', async () => {
    const outcome = await judged(
      'eternels-title-and-author',
      read('Éternels (tome 3)', 'Alyson Noël'),
    );

    expect(confirmedOf(outcome).record.context.volume).toBe(3);
  });

  it('confirms the original, not its adaptation, for « Le Mystère des pavots blancs »', async () => {
    const outcome = await judged(
      'pavots-title-and-author',
      read('Le Mystère des pavots blancs', 'Nancy Springer'),
    );

    expect(confirmedOf(outcome).record.authors[0].name).toBe('Springer, Nancy');
  });
});

describe('the cases of ADR 0014, several names and several editions', () => {
  it('confirms « D. Pennac - J. Ferrandez » on the record of the two names', async () => {
    const outcome = await judged(
      'oeil-du-loup-title-and-author',
      read("L'Oeil du loup", 'D. Pennac - J. Ferrandez'),
    );

    expect(retainedTitle(outcome)).toBe("L'oeil du loup");
  });

  it('confirms the editions of « Exercices de style » as one work, and a mis-read title too', async () => {
    const exact = await judged(
      'exercices-title-and-author',
      read('Exercices de style', 'Raymond Queneau'),
    );
    const faulty = await judged(
      'exercices-faute-title-and-author',
      read('Exercices de stile', 'Raymond Queneau'),
    );

    expect(exact.verdict).toBe('confirmed');
    expect(faulty.verdict).toBe('confirmed');
  });
});

describe('the cases of ADR 0014, the authorities', () => {
  const yacoubian = read("L'Immeuble Yacoubian", 'Alaa El Aswany');

  it('discards « Alaa El Aswany » against « Aswānī, ʿAlāʾ al- », and names the authority to ask', async () => {
    const outcome = await judged('yacoubian-title-and-author', yacoubian);

    expect(outcome.verdict).toBe('not_found');
    expect(
      outcome.needsAuthorityCheck.flatMap((check) => check.authorityIds.map((id) => id.value)),
    ).toContain('14623756');
  });

  it('confirms it once the authority gave its rejected form', async () => {
    const authorities = new BnfAuthorityAdapter({
      fetch: async () => new Response(fixture('authority-aswani')),
    });
    const forms = unwrap(
      await authorities.rejectedForms(
        unwrap(AuthorityId.of('14623756')),
        new AbortController().signal,
      ),
    );

    const outcome = matchBook(
      yacoubian,
      await pageOf('yacoubian-title-and-author'),
      settings,
      new Map([['14623756', forms]]),
    );

    expect(outcome.verdict).toBe('confirmed');
  });
});

describe('the cases of ADR 0014, the witnesses', () => {
  // A witness is a reading the shelf does not hold: the title of one book, the author of another.
  it.each([
    ['permuted, title and author', 'peste-hugo-title-and-author', 'full'],
    ['permuted, author alone', 'hugo-author-only', 'light'],
    ['permuted, title alone', 'peste-title-only', 'full'],
  ] as const)('never confirms a witness %s', async (_name, fixtureName, format) => {
    const outcome = await judged(fixtureName, read('La Peste', 'Victor Hugo'), format);

    expect(outcome.verdict).toBe('not_found');
  });

  it.each([
    ['fabricated-title-and-author', 'full'],
    ['delcourt-author-only', 'light'],
    ['fabricated-title-only', 'full'],
  ] as const)('never confirms a fabricated witness (%s)', async (fixtureName, format) => {
    const book = read('Les Ombres du lac de verre', 'Margaux Delcourt');

    expect((await judged(fixtureName, book, format)).verdict).toBe('not_found');
  });

  it('finds nothing of « Exercices de stile » on a page of the author alone that lacks it', async () => {
    const outcome = await judged(
      'queneau-author-only',
      read('Exercices de stile', 'Raymond Queneau'),
      'light',
    );

    expect(outcome.verdict).toBe('not_found');
  });
});
