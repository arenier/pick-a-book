import {
  BookReconciliationNotFound,
  CatalogRecordId,
  ScanRef,
  ShelfBookRef,
  type AmbiguityDecision,
  type BookNotAmbiguous,
  type BookReconciliationRepositoryPort,
  type InvalidValue,
  type UnknownCandidate,
} from '@pick-a-book/bibliography-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

import { toBookReconciliationDto, type BookReconciliationDto } from './reconciliation.dto.js';

/** What the user decided: the work they recognise among the candidates, or that none is it. */
export type AmbiguityChoice =
  | { readonly choice: 'candidate'; readonly recordId: string }
  | { readonly choice: 'none' };

export interface DecideAmbiguityCommand {
  readonly scanRef: string;
  /** The index of the book in the list of the analysis. */
  readonly position: number;
  readonly decision: AmbiguityChoice;
}

export type DecideAmbiguityFailure =
  | BookReconciliationNotFound
  | BookNotAmbiguous
  | UnknownCandidate
  | InvalidValue;

/**
 * Lets the user lift an ambiguity (specs/003, US2, FR-010): choose the work among the candidates,
 * or say that none is it. Once, and the automatic result stays beside the decision (FR-016) — the
 * attempt is never rewritten. The system never lifts an ambiguity by itself.
 */
export class DecideAmbiguityUseCase {
  constructor(private readonly repository: BookReconciliationRepositoryPort) {}

  async execute(
    command: DecideAmbiguityCommand,
  ): Promise<Result<BookReconciliationDto, DecideAmbiguityFailure>> {
    const scanRef = ScanRef.of(command.scanRef);
    if (!scanRef.ok) {
      return err(scanRef.error);
    }
    const bookRef = ShelfBookRef.of(scanRef.value, command.position);
    if (!bookRef.ok) {
      return err(bookRef.error);
    }
    const decision = toDecision(command.decision);
    if (!decision.ok) {
      return err(decision.error);
    }

    const book = await this.repository.findBook(bookRef.value);
    const read = book?.attempts.at(-1)?.read;
    if (book === undefined || read === undefined) {
      return err(new BookReconciliationNotFound(bookRef.value));
    }
    const decided = book.decide(decision.value);
    if (!decided.ok) {
      return err(decided.error);
    }
    // Refused here when another decision got in between: the same answer as a second decision.
    const saved = await this.repository.saveDecision(bookRef.value, decision.value);
    if (!saved.ok) {
      return err(saved.error);
    }

    const input =
      read.author === undefined
        ? { position: command.position, title: read.title }
        : { position: command.position, title: read.title, author: read.author };

    return ok(toBookReconciliationDto(input, decided.value));
  }
}

function toDecision(choice: AmbiguityChoice): Result<AmbiguityDecision, InvalidValue> {
  const decidedAt = new Date();
  if (choice.choice === 'none') {
    return ok({ kind: 'rejected', decidedAt });
  }
  const recordId = CatalogRecordId.of(choice.recordId);

  return recordId.ok
    ? ok({ kind: 'chosen', recordId: recordId.value, decidedAt })
    : err(recordId.error);
}
