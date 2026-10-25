import { HttpException } from '@nestjs/common';
import type {
  GetShelfReconciliationUseCase,
  ReconcileDetectedBooksUseCase,
  ShelfReconciliationDto,
} from '@pick-a-book/bibliography-application';
import type { GetShelfScanUseCase, ShelfScanDetailDto } from '@pick-a-book/recognition-application';
import { ok, type Result } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { GetShelfPhotoReconciliationUseCase } from './get-shelf-photo-reconciliation.use-case';
import { ReconcileShelfPhotoUseCase } from './reconcile-shelf-photo.use-case';
import type { ShelfScanLookupFailure } from './reconcile-shelf-photo.use-case';
import { ShelfPhotoReconciliationController } from './shelf-photo-reconciliation.controller';

const state = { books: [] };

/**
 * The controller over the real use cases of the orchestrator, whose collaborators — the use cases
 * of the two contexts — are doubles scripted with what they answer.
 */
function aController(
  detail: Result<ShelfScanDetailDto, ShelfScanLookupFailure>,
  reconciliation: Result<ShelfReconciliationDto, never>,
) {
  const getShelfScan = {
    execute: vi.fn<GetShelfScanUseCase['execute']>().mockResolvedValue(detail),
  };
  const reconcile = {
    execute: vi.fn<ReconcileDetectedBooksUseCase['execute']>().mockResolvedValue(reconciliation),
  };
  const read = {
    execute: vi.fn<GetShelfReconciliationUseCase['execute']>().mockResolvedValue(reconciliation),
  };

  return {
    reconcile,
    controller: new ShelfPhotoReconciliationController(
      new ReconcileShelfPhotoUseCase(getShelfScan, reconcile),
      new GetShelfPhotoReconciliationUseCase(getShelfScan, read),
    ),
  };
}

const completed: ShelfScanDetailDto = {
  id: 'an-id',
  createdAt: '2026-10-18T10:00:00.000Z',
  outcome: 'completed',
  hasThumbnail: false,
  books: [],
};

describe('ShelfPhotoReconciliationController', () => {
  it('answers a reconciliation with the state of every book', async () => {
    const { controller, reconcile } = aController(ok(completed), ok(state));

    await expect(controller.reconcileBooks('an-id')).resolves.toBe(state);
    expect(reconcile.execute).toHaveBeenCalledWith({ scanRef: 'an-id', books: [] });
  });

  it('answers a read with the state kept', async () => {
    const { controller } = aController(ok(completed), ok(state));

    await expect(controller.readReconciliation('an-id')).resolves.toBe(state);
  });

  it('throws the HTTP exception of a failure, for both routes', async () => {
    const pending = { ...completed, outcome: 'pending' as const, books: undefined };
    const { controller } = aController(ok(pending), ok(state));

    await expect(controller.reconcileBooks('an-id')).rejects.toBeInstanceOf(HttpException);
    await expect(controller.readReconciliation('an-id')).rejects.toMatchObject({ status: 409 });
  });
});
