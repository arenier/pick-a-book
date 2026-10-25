import {
  BookAlreadyReconciled,
  BookReconciliation,
  ScanRef,
  ShelfBookRef,
  type AmbiguityDecision,
  type BookNotAmbiguous,
  type BookReconciliationRepositoryPort,
  type ReconciliationAttempt,
} from '@pick-a-book/bibliography-domain';
import { err, ok, unwrap, type Result } from '@pick-a-book/shared-result';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { toAttempt, toRows, type AttemptRow } from './drizzle/reconciliation-mapping.js';
import { reconciliationAttempts, reconciliationCandidates } from './drizzle/schema.js';

/**
 * Keeps the reconciliation of every book in Postgres (ADR 0006).
 *
 * An attempt and the records it examined go in one transaction. The rule « one final attempt per
 * book » is the database's — a partial unique index — and this adapter turns its refusal into the
 * `Err` the port declares: two reconciliations of one analysis at once cannot both settle a book.
 */
export class DrizzleBookReconciliationRepositoryAdapter implements BookReconciliationRepositoryPort {
  private readonly db: NodePgDatabase;

  constructor(pool: Pool) {
    this.db = drizzle({ client: pool });
  }

  async saveAttempt(attempt: ReconciliationAttempt): Promise<Result<void, BookAlreadyReconciled>> {
    const rows = toRows(attempt);

    return this.db.transaction(async (tx) => {
      // `do nothing` on the unique index: a refused final attempt returns no row.
      const inserted = (
        await tx
          .insert(reconciliationAttempts)
          .values(rows.attempt)
          .onConflictDoNothing()
          .returning({ id: reconciliationAttempts.id })
      ).at(0);
      if (inserted === undefined) {
        return err(new BookAlreadyReconciled(attempt.bookRef));
      }

      const candidates = rows.candidates(inserted.id);
      if (candidates.length > 0) {
        await tx.insert(reconciliationCandidates).values(candidates);
      }

      return ok();
    });
  }

  async saveDecision(
    _bookRef: ShelfBookRef,
    _decision: AmbiguityDecision,
  ): Promise<Result<void, BookNotAmbiguous>> {
    // Added with the decision of an ambiguity (specs/003, T049).
    throw new Error('saveDecision is not implemented yet');
  }

  async findByScan(scanRef: ScanRef): Promise<readonly BookReconciliation[]> {
    const rows = await this.db
      .select()
      .from(reconciliationAttempts)
      .where(eq(reconciliationAttempts.scanRef, scanRef.value))
      .orderBy(asc(reconciliationAttempts.position), asc(reconciliationAttempts.attemptedAt));

    return this.toBooks(rows);
  }

  async findBook(bookRef: ShelfBookRef): Promise<BookReconciliation | undefined> {
    const rows = await this.db
      .select()
      .from(reconciliationAttempts)
      .where(
        and(
          eq(reconciliationAttempts.scanRef, bookRef.scanRef.value),
          eq(reconciliationAttempts.position, bookRef.position),
        ),
      )
      .orderBy(asc(reconciliationAttempts.attemptedAt));

    return (await this.toBooks(rows)).at(0);
  }

  /** Groups the attempts of each book, in the order they were read, and attaches their records. */
  private async toBooks(rows: readonly AttemptRow[]): Promise<readonly BookReconciliation[]> {
    if (rows.length === 0) {
      return [];
    }
    const candidates = await this.db
      .select()
      .from(reconciliationCandidates)
      .where(
        inArray(
          reconciliationCandidates.attemptId,
          rows.map((row) => row.id),
        ),
      );

    const byPosition = new Map<number, AttemptRow[]>();
    for (const row of rows) {
      byPosition.set(row.position, [...(byPosition.get(row.position) ?? []), row]);
    }

    return [...byPosition.entries()]
      .toSorted(([a], [b]) => a - b)
      .map(([position, attempts]) => {
        const scanRef = attempts[0].scanRef;
        const bookRef = unwrap(ShelfBookRef.of(unwrap(ScanRef.of(scanRef)), position));

        return BookReconciliation.restore(
          bookRef,
          attempts.map((row) =>
            toAttempt(
              bookRef,
              row,
              candidates.filter((candidate) => candidate.attemptId === row.id),
            ),
          ),
        );
      });
  }
}
