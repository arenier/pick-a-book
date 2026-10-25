import { CatalogUnavailable } from '@pick-a-book/bibliography-domain';
import { aRecord } from '@pick-a-book/bibliography-domain/testing';
import { describe, expect, it } from 'vitest';

import { FakeAuthority } from '../testing/fake-authority.js';
import { A_SCAN, aDetectedBook, aReconciler } from '../testing/reconcile-scenario.js';

const AUTHORITY = 'ark:/12148/cb-aswani';
const yacoubian = aRecord({
  id: 'ark:/12148/yacoubian',
  title: 'L’Immeuble Yacoubian',
  authors: [{ name: 'Aswānī, ʿAlāʾ al-', role: 'main', authorityId: AUTHORITY }],
});
const book = aDetectedBook(0, 'L’Immeuble Yacoubian', 'Alaa El Aswany');

describe('ReconcileDetectedBooksUseCase, the rejected forms of the authorities', () => {
  it('confirms a transliterated author once the authority gave its rejected form', async () => {
    const authorities = new FakeAuthority({ [AUTHORITY]: ['Aswany, Alaa el-'] });
    const { useCase, catalog } = aReconciler({ authorities });
    catalog.always([yacoubian]);

    const result = await useCase.execute({ scanRef: A_SCAN, books: [book] });

    expect(result).toMatchObject({ ok: true, value: { books: [{ status: 'confirmed' }] } });
  });

  it('asks an authority only once, however many steps and books want it', async () => {
    const authorities = new FakeAuthority({ [AUTHORITY]: [] });
    const { useCase, catalog } = aReconciler({ authorities });
    catalog.always([yacoubian]);

    await useCase.execute({ scanRef: A_SCAN, books: [book, { ...book, position: 1 }] });

    expect(authorities.asked).toStrictEqual([AUTHORITY]);
  });

  it('asks no authority when the author already matches', async () => {
    const authorities = new FakeAuthority();
    const { useCase, catalog } = aReconciler({ authorities });
    catalog.always([yacoubian]);

    await useCase.execute({
      scanRef: A_SCAN,
      books: [aDetectedBook(0, 'L’Immeuble Yacoubian', 'Alaa al-Aswānī')],
    });

    expect(authorities.asked).toStrictEqual([]);
  });

  // A failing authority is not « not verified »: the record stays discarded, as before the ADR.
  it('leaves the record discarded when the authority fails, without a « not verified »', async () => {
    const authorities = new FakeAuthority({ [AUTHORITY]: new CatalogUnavailable('unavailable') });
    const { useCase, catalog } = aReconciler({ authorities });
    catalog.always([yacoubian]);

    const result = await useCase.execute({ scanRef: A_SCAN, books: [book] });

    expect(result).toMatchObject({ ok: true, value: { books: [{ status: 'not_found' }] } });
  });
});
