import { aRecord } from '@pick-a-book/bibliography-domain/testing';
import { describe, expect, it } from 'vitest';

import { A_SCAN, aDetectedBook, aReconciler, peste } from '../testing/reconcile-scenario.js';

/** What the catalogue was asked, in order: « title / author / how many / which format ». */
function asked(catalog: ReturnType<typeof aReconciler>['catalog']): readonly string[] {
  return catalog.queries.map(
    (query) =>
      `${query.title ?? '-'} / ${query.author ?? '-'} / ${query.maxRecords} / ${query.format}`,
  );
}

describe('ReconcileDetectedBooksUseCase, the cascade of queries', () => {
  it('asks for the title and the author first, and stops at the first verdict', async () => {
    const { useCase, catalog } = aReconciler();
    catalog.always([peste]);

    await useCase.execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'La Peste', 'Albert Camus')],
    });

    expect(asked(catalog)).toStrictEqual(['La Peste / Albert Camus / 20 / full']);
  });

  it('goes on with the author alone, then the title alone, when nothing is found', async () => {
    const { useCase, catalog } = aReconciler();

    await useCase.execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'La Peste', 'Albert Camus')],
    });

    expect(asked(catalog)).toStrictEqual([
      'La Peste / Albert Camus / 20 / full',
      '- / Albert Camus / 100 / light',
      'La Peste / - / 20 / full',
    ]);
  });

  it('stops at the author alone when the titles are matched there', async () => {
    const { useCase, catalog } = aReconciler();
    catalog.on((query) => query.title === undefined, [peste]);

    const result = await useCase.execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'La Pest', 'Albert Camus')],
    });

    expect(asked(catalog)).toHaveLength(2);
    expect(result).toMatchObject({ ok: true, value: { books: [{ status: 'confirmed' }] } });
  });
});

describe('ReconcileDetectedBooksUseCase, the cascade of queries, part 2', () => {
  it('skips the two steps that need an author when none was read', async () => {
    const { useCase, catalog } = aReconciler();

    await useCase.execute({ scanRef: A_SCAN, books: [aDetectedBook(0, 'La Peste')] });

    expect(asked(catalog)).toStrictEqual(['La Peste / - / 20 / full']);
  });

  it('queries each segment of a composed title last, on the title alone', async () => {
    const { useCase, catalog } = aReconciler();

    await useCase.execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'Percy Jackson - La Mer des Monstres')],
    });

    expect(asked(catalog)).toStrictEqual([
      'Percy Jackson La Mer des Monstres / - / 20 / full',
      'Percy Jackson / - / 20 / full',
      'La Mer des Monstres / - / 20 / full',
    ]);
  });

  it('confirms through a segment when the record explains the rest', async () => {
    const { useCase, catalog } = aReconciler();
    const percy = aRecord({
      id: 'ark:/12148/percy',
      title: 'La Mer des monstres',
      authors: [{ name: 'Riordan, Rick', role: 'main' }],
      context: { series: 'Percy Jackson', volume: 2 },
    });
    catalog.on((query) => query.title === 'La Mer des Monstres', [percy]);

    const result = await useCase.execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'Percy Jackson - La Mer des Monstres')],
    });

    expect(result).toMatchObject({ ok: true, value: { books: [{ status: 'confirmed' }] } });
  });
});

describe('ReconcileDetectedBooksUseCase, the cascade of queries, part 3', () => {
  it('asks about the first of several names read', async () => {
    const { useCase, catalog } = aReconciler();

    await useCase.execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'Chaque fois', 'D. Pennac - J. Ferrandez')],
    });

    expect(asked(catalog)[0]).toBe('Chaque fois / D. Pennac / 20 / full');
  });

  it('also tries the title without a trailing bare number', async () => {
    const { useCase, catalog } = aReconciler();

    await useCase.execute({ scanRef: A_SCAN, books: [aDetectedBook(0, 'Harry Potter 3')] });

    expect(asked(catalog)).toStrictEqual([
      'Harry Potter 3 / - / 20 / full',
      'Harry Potter / - / 20 / full',
    ]);
  });
});
