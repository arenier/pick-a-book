import {
  BookReconciliation,
  ReadBook,
  ScanRef,
  ShelfBookRef,
  type AuthorityPort,
  type BibliographicCatalogPort,
  type BookReconciliationRepositoryPort,
  type InvalidValue,
  type MatchingSettings,
} from '@pick-a-book/bibliography-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

import { BookCascade } from './book-cascade.js';
import {
  toBookReconciliationDto,
  type DetectedBookInput,
  type ShelfReconciliationDto,
} from './reconciliation.dto.js';
import { RequestRunner, type ReconciliationLimits } from './run-with-limits.js';

export interface ReconcileDetectedBooksCommand {
  /** The analysis the books were detected in. */
  readonly scanRef: string;
  readonly books: readonly DetectedBookInput[];
}

interface Book {
  readonly input: DetectedBookInput;
  readonly bookRef: ShelfBookRef;
  readonly read: ReadBook;
}

/**
 * Reconciles the detected books of an analysis against the catalogue (specs/003, US1).
 *
 * Only the books with no final status are searched — all of them the first time, the « not
 * verified » ones on a retry (FR-014) — and the answer is the state of **all** the books, by
 * position. A catalogue that fails never fails this use case: the books it could not answer for
 * are « not verified » (FR-008). The only `Err` is a reference or a reading that is not valid,
 * which the recognition has already proven.
 */
export class ReconcileDetectedBooksUseCase {
  constructor(
    private readonly catalog: BibliographicCatalogPort,
    private readonly authorities: AuthorityPort,
    private readonly repository: BookReconciliationRepositoryPort,
    private readonly settings: MatchingSettings,
    private readonly limits: ReconciliationLimits,
  ) {}

  async execute(
    command: ReconcileDetectedBooksCommand,
  ): Promise<Result<ShelfReconciliationDto, InvalidValue>> {
    const scanRef = ScanRef.of(command.scanRef);
    if (!scanRef.ok) {
      return err(scanRef.error);
    }
    const books = toBooks(scanRef.value, command.books);
    if (!books.ok) {
      return err(books.error);
    }

    const known = await this.repository.findByScan(scanRef.value);
    const todo = books.value.filter((book) =>
      (
        known.find((kept) => kept.bookRef.equals(book.bookRef)) ??
        BookReconciliation.start(book.bookRef)
      ).needsAttempt(),
    );
    await this.reconcileAll(todo);

    return ok(await this.stateOf(scanRef.value, books.value));
  }

  private async reconcileAll(todo: readonly Book[]): Promise<void> {
    const cascade = new BookCascade(
      this.catalog,
      this.authorities,
      this.settings,
      new RequestRunner(this.limits),
    );

    await Promise.all(
      todo.map(async ({ bookRef, read }) => {
        const result = await cascade.reconcile(read);
        // Refused when another reconciliation of this analysis settled the book first: that
        // answer stands, and the state read below is the same for both calls (research §3).
        await this.repository.saveAttempt({
          bookRef,
          read,
          catalog: this.catalog.name,
          attemptedAt: new Date(),
          result,
        });
      }),
    );
  }

  private async stateOf(scanRef: ScanRef, books: readonly Book[]): Promise<ShelfReconciliationDto> {
    const kept = await this.repository.findByScan(scanRef);

    return {
      books: books
        .toSorted((a, b) => a.input.position - b.input.position)
        .map(({ input, bookRef }) =>
          toBookReconciliationDto(
            input,
            kept.find((book) => book.bookRef.equals(bookRef)),
          ),
        ),
    };
  }
}

function toBooks(
  scanRef: ScanRef,
  inputs: readonly DetectedBookInput[],
): Result<Book[], InvalidValue> {
  const books: Book[] = [];
  for (const input of inputs) {
    const bookRef = ShelfBookRef.of(scanRef, input.position);
    if (!bookRef.ok) {
      return err(bookRef.error);
    }
    const read = ReadBook.of(input.title, input.author);
    if (!read.ok) {
      return err(read.error);
    }
    books.push({ input, bookRef: bookRef.value, read: read.value });
  }

  return ok(books);
}
