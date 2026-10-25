import type {
  GetShelfReconciliationUseCase,
  ShelfReconciliationDto,
} from '@pick-a-book/bibliography-application';
import type { GetShelfScanUseCase, ShelfScanDetailDto } from '@pick-a-book/recognition-application';
import { err, ok, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { GetShelfPhotoReconciliationUseCase } from './get-shelf-photo-reconciliation.use-case';

const ID = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';
const state: ShelfReconciliationDto = {
  books: [{ position: 0, read: { title: 'x' }, status: 'pending' }],
};
const completed: ShelfScanDetailDto = {
  id: ID,
  createdAt: '2026-10-18T10:00:00.000Z',
  outcome: 'completed',
  hasThumbnail: false,
  books: [{ title: 'La Peste', confidence: 0.9 }],
};

function aGetter(found: Awaited<ReturnType<GetShelfScanUseCase['execute']>>) {
  const getShelfScan = {
    execute: vi.fn<GetShelfScanUseCase['execute']>().mockResolvedValue(found),
  };
  const getReconciliation = {
    execute: vi.fn<GetShelfReconciliationUseCase['execute']>().mockResolvedValue(ok(state)),
  };

  return {
    getReconciliation,
    useCase: new GetShelfPhotoReconciliationUseCase(getShelfScan, getReconciliation),
  };
}

describe('GetShelfPhotoReconciliationUseCase', () => {
  it('reads the kept state of the books of the analysis', async () => {
    const { useCase, getReconciliation } = aGetter(ok(completed));

    const result = await useCase.execute({ id: ID });

    expect(getReconciliation.execute).toHaveBeenCalledWith({
      scanRef: ID,
      books: [{ position: 0, title: 'La Peste' }],
    });
    expect(unwrap(result)).toBe(state);
  });

  it('passes on an analysis that is unknown, or someone else`s', async () => {
    const { useCase, getReconciliation } = aGetter(
      err(Object.assign(new Error('nope'), { kind: 'shelf-scan-not-found' as const })),
    );

    await expect(useCase.execute({ id: ID })).resolves.toMatchObject({
      ok: false,
      error: { kind: 'shelf-scan-not-found' },
    });
    expect(getReconciliation.execute).not.toHaveBeenCalled();
  });

  it('refuses an analysis that did not complete', async () => {
    const { useCase } = aGetter(ok({ ...completed, outcome: 'pending', books: undefined }));

    await expect(useCase.execute({ id: ID })).resolves.toMatchObject({
      ok: false,
      error: { kind: 'shelf-scan-not-completed' },
    });
  });
});
