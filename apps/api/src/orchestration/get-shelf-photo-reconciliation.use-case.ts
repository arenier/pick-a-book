import type {
  GetShelfReconciliationUseCase,
  ShelfReconciliationDto,
} from '@pick-a-book/bibliography-application';
import type { GetShelfScanUseCase } from '@pick-a-book/recognition-application';
import { err, type Result } from '@pick-a-book/shared-result';

import { detectedBooksOf } from './detected-books';
import type { ReconcileShelfPhotoFailure } from './reconcile-shelf-photo.use-case';

export interface GetShelfPhotoReconciliationCommand {
  readonly id: string;
}

/**
 * Reads the kept state of the books of an analysis (ADR 0003), **without calling the catalogue**
 * (SC-005): the same two steps as the reconciliation — read the analysis, owner checked, then hand
 * its books over — but to the use case that only reads.
 */
export class GetShelfPhotoReconciliationUseCase {
  constructor(
    private readonly getShelfScan: Pick<GetShelfScanUseCase, 'execute'>,
    private readonly getReconciliation: Pick<GetShelfReconciliationUseCase, 'execute'>,
  ) {}

  async execute(
    command: GetShelfPhotoReconciliationCommand,
  ): Promise<Result<ShelfReconciliationDto, ReconcileShelfPhotoFailure>> {
    const detail = await this.getShelfScan.execute({ id: command.id });
    if (!detail.ok) {
      return detail;
    }
    const books = detectedBooksOf(detail.value);
    if ('kind' in books) {
      return err(books);
    }

    return this.getReconciliation.execute({ scanRef: detail.value.id, books });
  }
}
