import type {
  ReconcileDetectedBooksUseCase,
  ShelfReconciliationDto,
} from '@pick-a-book/bibliography-application';
import type { GetShelfScanUseCase } from '@pick-a-book/recognition-application';
import { err, type Result } from '@pick-a-book/shared-result';

import { detectedBooksOf } from './detected-books';
import type { ShelfScanNotCompleted } from './shelf-scan-not-completed.error';

type Failure<Execute extends (command: never) => Promise<Result<unknown, unknown>>> = Extract<
  Awaited<ReturnType<Execute>>,
  { ok: false }
>['error'];

/** What reading an analysis can refuse: it is unknown or someone else's. */
export type ShelfScanLookupFailure = Failure<GetShelfScanUseCase['execute']>;

/** What reconciling can refuse beyond that: a reference or a reading that is not valid. */
export type ReconcileFailure = Failure<ReconcileDetectedBooksUseCase['execute']>;

export type ReconcileShelfPhotoFailure =
  | ShelfScanLookupFailure
  | ShelfScanNotCompleted
  | ReconcileFailure;

export interface ReconcileShelfPhotoCommand {
  /** As received — the id of the upload, which is the id of the analysis. */
  readonly id: string;
}

/**
 * Reconciles the books an analysis detected (ADR 0003): it reads the detail of the analysis in
 * `recognition` — which checks that it is the owner's — and hands its books to `bibliography`.
 * It sequences and translates; it decides nothing, and handles boundary DTOs only.
 */
export class ReconcileShelfPhotoUseCase {
  constructor(
    private readonly getShelfScan: Pick<GetShelfScanUseCase, 'execute'>,
    private readonly reconcile: Pick<ReconcileDetectedBooksUseCase, 'execute'>,
  ) {}

  async execute(
    command: ReconcileShelfPhotoCommand,
  ): Promise<Result<ShelfReconciliationDto, ReconcileShelfPhotoFailure>> {
    const detail = await this.getShelfScan.execute({ id: command.id });
    if (!detail.ok) {
      return detail;
    }
    const books = detectedBooksOf(detail.value);
    if ('kind' in books) {
      return err(books);
    }

    return this.reconcile.execute({ scanRef: detail.value.id, books });
  }
}
