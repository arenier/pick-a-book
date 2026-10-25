import type {
  ReconcileDetectedBooksUseCase,
  ShelfReconciliationDto,
} from '@pick-a-book/bibliography-application';
import type { GetShelfScanUseCase, ShelfScanDetailDto } from '@pick-a-book/recognition-application';
import { err, ok, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { ReconcileShelfPhotoUseCase } from './reconcile-shelf-photo.use-case';

const ID = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';
const reconciled: ShelfReconciliationDto = { books: [] };

function detail(overrides: Partial<ShelfScanDetailDto> = {}): ShelfScanDetailDto {
  return {
    id: ID,
    createdAt: '2026-10-18T10:00:00.000Z',
    outcome: 'completed',
    hasThumbnail: false,
    books: [
      { title: 'La Peste', author: 'Albert Camus', confidence: 0.9 },
      { title: 'Titre sans auteur', confidence: 0.4 },
    ],
    ...overrides,
  };
}

/** The two use cases the orchestrator sequences, as doubles that remember what they were asked. */
function aReconciler(found: Awaited<ReturnType<GetShelfScanUseCase['execute']>>) {
  const getShelfScan = {
    execute: vi.fn<GetShelfScanUseCase['execute']>().mockResolvedValue(found),
  };
  const reconcile = {
    execute: vi.fn<ReconcileDetectedBooksUseCase['execute']>().mockResolvedValue(ok(reconciled)),
  };

  return {
    reconcile,
    getShelfScan,
    useCase: new ReconcileShelfPhotoUseCase(getShelfScan, reconcile),
  };
}

describe('ReconcileShelfPhotoUseCase', () => {
  it('hands the books of the analysis to bibliography, by position, without their confidence', async () => {
    const { useCase, reconcile, getShelfScan } = aReconciler(ok(detail()));

    const result = await useCase.execute({ id: ID });

    expect(getShelfScan.execute).toHaveBeenCalledWith({ id: ID });
    expect(reconcile.execute).toHaveBeenCalledWith({
      scanRef: ID,
      books: [
        { position: 0, title: 'La Peste', author: 'Albert Camus' },
        { position: 1, title: 'Titre sans auteur' },
      ],
    });
    expect(unwrap(result)).toBe(reconciled);
  });

  it('passes on an analysis that is unknown, or someone else`s, as it came', async () => {
    const { useCase, reconcile } = aReconciler(
      err(Object.assign(new Error('nope'), { kind: 'shelf-scan-not-found' as const })),
    );

    const result = await useCase.execute({ id: ID });

    expect(result).toMatchObject({ ok: false, error: { kind: 'shelf-scan-not-found' } });
    expect(reconcile.execute).not.toHaveBeenCalled();
  });

  it.each(['pending', 'failed'] as const)('refuses an analysis that is %s', async (outcome) => {
    const { useCase, reconcile } = aReconciler(ok(detail({ outcome, books: undefined })));

    const result = await useCase.execute({ id: ID });

    expect(result).toMatchObject({ ok: false, error: { kind: 'shelf-scan-not-completed' } });
    expect(reconcile.execute).not.toHaveBeenCalled();
  });

  it('reconciles an analysis without any book, which has nothing to say', async () => {
    const { useCase, reconcile } = aReconciler(ok(detail({ books: [] })));

    await useCase.execute({ id: ID });

    expect(reconcile.execute).toHaveBeenCalledWith({ scanRef: ID, books: [] });
  });
});
