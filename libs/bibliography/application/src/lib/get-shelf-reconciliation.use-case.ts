import {
  ScanRef,
  ShelfBookRef,
  type BookReconciliationRepositoryPort,
  type InvalidValue,
} from '@pick-a-book/bibliography-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

import {
  toBookReconciliationDto,
  type DetectedBookInput,
  type ShelfReconciliationDto,
} from './reconciliation.dto.js';

export interface GetShelfReconciliationCommand {
  readonly scanRef: string;
  readonly books: readonly DetectedBookInput[];
}

/**
 * Gives the kept state of the books of an analysis, **without ever calling the catalogue** or an
 * authority (SC-005, ADR 0014: a book already reconciled calls nobody): it is handed a
 * repository and nothing else. A book never tried is `pending`; the screen then asks for the
 * reconciliation (FR-024).
 */
export class GetShelfReconciliationUseCase {
  constructor(private readonly repository: BookReconciliationRepositoryPort) {}

  async execute(
    command: GetShelfReconciliationCommand,
  ): Promise<Result<ShelfReconciliationDto, InvalidValue>> {
    const scanRef = ScanRef.of(command.scanRef);
    if (!scanRef.ok) {
      return err(scanRef.error);
    }
    const kept = await this.repository.findByScan(scanRef.value);

    const books: ShelfReconciliationDto['books'][number][] = [];
    for (const input of command.books.toSorted((a, b) => a.position - b.position)) {
      const bookRef = ShelfBookRef.of(scanRef.value, input.position);
      if (!bookRef.ok) {
        return err(bookRef.error);
      }
      books.push(
        toBookReconciliationDto(
          input,
          kept.find((book) => book.bookRef.equals(bookRef.value)),
        ),
      );
    }

    return ok({ books });
  }
}
