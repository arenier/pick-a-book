import type {
  BookReconciliationDto,
  DecideAmbiguityUseCase,
} from '@pick-a-book/bibliography-application';
import type { GetShelfScanUseCase, ShelfScanDetailDto } from '@pick-a-book/recognition-application';
import { err, ok, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { DecideShelfBookAmbiguityUseCase } from './decide-shelf-book-ambiguity.use-case';

const ID = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';
const decided: BookReconciliationDto = {
  position: 2,
  read: { title: 'La Chute' },
  status: 'not_found',
};
const detail: ShelfScanDetailDto = {
  id: ID,
  createdAt: '2026-10-18T10:00:00.000Z',
  outcome: 'completed',
  hasThumbnail: false,
  books: [],
};

function aDecider(found: Awaited<ReturnType<GetShelfScanUseCase['execute']>>) {
  const getShelfScan = {
    execute: vi.fn<GetShelfScanUseCase['execute']>().mockResolvedValue(found),
  };
  const decide = {
    execute: vi.fn<DecideAmbiguityUseCase['execute']>().mockResolvedValue(ok(decided)),
  };

  return { decide, useCase: new DecideShelfBookAmbiguityUseCase(getShelfScan, decide) };
}

describe('DecideShelfBookAmbiguityUseCase', () => {
  it('checks that the analysis is the owner`s, then hands the decision to bibliography', async () => {
    const { useCase, decide } = aDecider(ok(detail));

    const result = await useCase.execute({ id: ID, position: 2, decision: { choice: 'none' } });

    expect(unwrap(result)).toBe(decided);
    expect(decide.execute).toHaveBeenCalledWith({
      scanRef: ID,
      position: 2,
      decision: { choice: 'none' },
    });
  });

  it('passes on an analysis that is unknown, or someone else`s, and decides nothing', async () => {
    const { useCase, decide } = aDecider(
      err(Object.assign(new Error('nope'), { kind: 'shelf-scan-not-found' as const })),
    );

    const result = await useCase.execute({ id: ID, position: 2, decision: { choice: 'none' } });

    expect(result).toMatchObject({ ok: false, error: { kind: 'shelf-scan-not-found' } });
    expect(decide.execute).not.toHaveBeenCalled();
  });

  it('passes on what bibliography refuses', async () => {
    const { useCase, decide } = aDecider(ok(detail));
    decide.execute.mockResolvedValue(
      err(
        Object.assign(new Error('x'), { kind: 'book-not-ambiguous' as const, bookRef: undefined }),
      ),
    );

    const result = await useCase.execute({ id: ID, position: 2, decision: { choice: 'none' } });

    expect(result).toMatchObject({ ok: false, error: { kind: 'book-not-ambiguous' } });
  });
});
