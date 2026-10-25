import {
  BookAlreadyReconciled,
  BookReconciliation,
  type AmbiguityDecision,
  type BookNotAmbiguous,
  type BookReconciliationRepositoryPort,
  type ReconciliationAttempt,
  type ScanRef,
  type ShelfBookRef,
} from '@pick-a-book/bibliography-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

/**
 * The repository in memory, for the specs of the use cases. It holds **the same rules** as the
 * Postgres adapter — one final attempt per book, attempts in the order they were saved — or the
 * specs would prove a behaviour production does not have.
 */
export class InMemoryBookReconciliationRepository implements BookReconciliationRepositoryPort {
  private readonly books = new Map<string, BookReconciliation>();

  /** How many times a read went to the store: the specs prove a screen never searched again. */
  reads = 0;

  async saveAttempt(attempt: ReconciliationAttempt): Promise<Result<void, BookAlreadyReconciled>> {
    const current =
      this.books.get(keyOf(attempt.bookRef)) ?? BookReconciliation.start(attempt.bookRef);
    const next = current.recordAttempt(attempt);
    if (!next.ok) {
      return err(next.error);
    }
    this.books.set(keyOf(attempt.bookRef), next.value);

    return ok();
  }

  async saveDecision(
    _bookRef: ShelfBookRef,
    _decision: AmbiguityDecision,
  ): Promise<Result<void, BookNotAmbiguous>> {
    throw new Error('saveDecision is not implemented yet');
  }

  async findByScan(scanRef: ScanRef): Promise<readonly BookReconciliation[]> {
    this.reads += 1;

    return [...this.books.values()]
      .filter((book) => book.bookRef.scanRef.equals(scanRef))
      .toSorted((a, b) => a.bookRef.position - b.bookRef.position);
  }

  async findBook(bookRef: ShelfBookRef): Promise<BookReconciliation | undefined> {
    this.reads += 1;

    return this.books.get(keyOf(bookRef));
  }

  /** Every attempt kept, for the specs that count them. */
  attemptsOf(bookRef: ShelfBookRef): readonly ReconciliationAttempt[] {
    return this.books.get(keyOf(bookRef))?.attempts ?? [];
  }
}

function keyOf(bookRef: ShelfBookRef): string {
  return bookRef.toString();
}
