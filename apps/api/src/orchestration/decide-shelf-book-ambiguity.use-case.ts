import type {
  AmbiguityChoice,
  BookReconciliationDto,
  DecideAmbiguityFailure,
  DecideAmbiguityUseCase,
} from '@pick-a-book/bibliography-application';
import type { GetShelfScanUseCase } from '@pick-a-book/recognition-application';
import type { Result } from '@pick-a-book/shared-result';

import type { ShelfScanLookupFailure } from './reconcile-shelf-photo.use-case';

export type DecideShelfBookAmbiguityFailure = ShelfScanLookupFailure | DecideAmbiguityFailure;

export interface DecideShelfBookAmbiguityCommand {
  /** As received — the id of the upload, which is the id of the analysis. */
  readonly id: string;
  readonly position: number;
  readonly decision: AmbiguityChoice;
}

/**
 * Lifts the ambiguity of a book on the user's word (ADR 0003): the analysis is read in
 * `recognition` first, which checks that it is the owner's — `bibliography` knows nothing of
 * owners —, then the decision goes to `bibliography`. A position outside the list has no
 * reconciliation: `bibliography` refuses it as a book never reconciled.
 */
export class DecideShelfBookAmbiguityUseCase {
  constructor(
    private readonly getShelfScan: Pick<GetShelfScanUseCase, 'execute'>,
    private readonly decide: Pick<DecideAmbiguityUseCase, 'execute'>,
  ) {}

  async execute(
    command: DecideShelfBookAmbiguityCommand,
  ): Promise<Result<BookReconciliationDto, DecideShelfBookAmbiguityFailure>> {
    const detail = await this.getShelfScan.execute({ id: command.id });
    if (!detail.ok) {
      return detail;
    }

    return this.decide.execute({
      scanRef: detail.value.id,
      position: command.position,
      decision: command.decision,
    });
  }
}
