import { BookReconciliation } from '@pick-a-book/bibliography-domain';
import {
  aBookRef,
  aConfirmed,
  aMatch,
  aNotFound,
  anAmbiguous,
  anAttempt,
  aRecord,
} from '@pick-a-book/bibliography-domain/testing';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { toBookReconciliationDto, type DetectedBookInput } from './reconciliation.dto.js';

const input: DetectedBookInput = { position: 0, title: 'La Pest', author: 'Albert Camus' };

function settled(result: Parameters<typeof anAttempt>[1]): BookReconciliation {
  const bookRef = aBookRef(0);
  return unwrap(BookReconciliation.start(bookRef).recordAttempt(anAttempt(bookRef, result)));
}

const camus = aRecord({
  id: 'ark:/12148/cb1',
  title: 'La peste',
  authors: [
    { name: 'Ferrandez, Jacques', role: 'secondary' },
    { name: 'Camus, Albert (1913-1960)', role: 'main' },
  ],
});

describe('toBookReconciliationDto, one row per status', () => {
  it('shows a book never tried as pending', () => {
    expect(toBookReconciliationDto(input, BookReconciliation.start(aBookRef(0)))).toStrictEqual({
      position: 0,
      read: { title: 'La Pest', author: 'Albert Camus' },
      status: 'pending',
    });
  });

  it('shows a book with no aggregate at all as pending', () => {
    expect(toBookReconciliationDto(input).status).toBe('pending');
  });

  it('shows a confirmed book with its reference, main authors first', () => {
    expect(toBookReconciliationDto(input, settled(aMatch(aConfirmed(camus))))).toStrictEqual({
      position: 0,
      read: { title: 'La Pest', author: 'Albert Camus' },
      status: 'confirmed',
      confirmedBy: 'automatic',
      titleOnly: false,
      reference: {
        recordId: 'ark:/12148/cb1',
        title: 'La peste',
        authors: ['Albert Camus', 'Jacques Ferrandez'],
      },
    });
  });

  it('shows the candidates of an ambiguity, in rank order', () => {
    const other = aRecord({ id: 'ark:/12148/cb2', title: 'La chute', authors: [] });

    const dto = toBookReconciliationDto(input, settled(aMatch(anAmbiguous([camus, other]))));

    expect(dto).toMatchObject({
      status: 'ambiguous',
      candidates: [
        { recordId: 'ark:/12148/cb1', title: 'La peste' },
        { recordId: 'ark:/12148/cb2', title: 'La chute', authors: [] },
      ],
    });
  });
});

describe('toBookReconciliationDto, the statuses with nothing more', () => {
  it('shows a book not found, and a book not verified, with nothing more', () => {
    const notFound = toBookReconciliationDto(input, settled(aMatch(aNotFound(), null, 0)));
    const notVerified = toBookReconciliationDto(
      input,
      settled({ kind: 'not_verified', cause: 'timeout' }),
    );

    expect(notFound).toStrictEqual({ position: 0, read: readOfInput(), status: 'not_found' });
    expect(notVerified).toStrictEqual({ position: 0, read: readOfInput(), status: 'not_verified' });
  });
});

function readOfInput() {
  return { title: 'La Pest', author: 'Albert Camus' };
}

describe('toBookReconciliationDto, what is read and what is hidden', () => {
  it('leaves the author out when none was read, never as an empty string', () => {
    const dto = toBookReconciliationDto(
      { position: 3, title: 'La Peste' },
      settled(aMatch(aConfirmed(camus))),
    );

    expect(dto.read).toStrictEqual({ title: 'La Peste' });
    expect(dto).toMatchObject({ status: 'confirmed', titleOnly: true });
  });

  // FR-018: scores, catalogue, step and cause are kept for the analysis, not shown.
  it('carries no score, catalogue, step nor cause', () => {
    const dtos = [
      toBookReconciliationDto(input, settled(aMatch(aConfirmed(camus)))),
      toBookReconciliationDto(input, settled(aMatch(anAmbiguous([camus, aRecord()])))),
      toBookReconciliationDto(input, settled({ kind: 'not_verified', cause: 'unavailable' })),
    ];

    for (const dto of dtos) {
      expect(JSON.stringify(dto)).not.toMatch(/score|catalog|step|cause|confidence/iu);
    }
  });
});
