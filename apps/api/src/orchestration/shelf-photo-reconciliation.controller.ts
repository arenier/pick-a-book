import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type {
  BookReconciliationDto,
  ShelfReconciliationDto,
} from '@pick-a-book/bibliography-application';
import type { Result } from '@pick-a-book/shared-result';

import { z } from 'zod';

import { DecideShelfBookAmbiguityUseCase } from './decide-shelf-book-ambiguity.use-case';
import { GetShelfPhotoReconciliationUseCase } from './get-shelf-photo-reconciliation.use-case';
import { toHttpException, type OrchestrationError } from './orchestration-http-error';
import { ReconcileShelfPhotoUseCase } from './reconcile-shelf-photo.use-case';

/**
 * The reconciliation of the books of an analysis (contracts/reconciliation-api.md):
 *
 * - `POST /shelf-photos/{id}/reconciliation` reconciles the books with no final status — all of
 *   them the first time, the « not verified » ones on a retry — and answers with every book;
 * - `GET /shelf-photos/{id}/reconciliation` answers with the state kept, and never asks the
 *   catalogue.
 *
 * Handles boundary DTOs only (ADR 0003). A failure is an `Err`, said in HTTP by one `switch`
 * (ADR 0013); a catalogue that is down is not a failure but a « not verified » book, in a 200.
 */
@Controller('shelf-photos')
export class ShelfPhotoReconciliationController {
  constructor(
    private readonly reconcile: ReconcileShelfPhotoUseCase,
    private readonly read: GetShelfPhotoReconciliationUseCase,
    private readonly decide: DecideShelfBookAmbiguityUseCase,
  ) {}

  @Post(':id/reconciliation')
  @HttpCode(200)
  async reconcileBooks(@Param('id') id: string): Promise<ShelfReconciliationDto> {
    return unwrapOrThrow(await this.reconcile.execute({ id }));
  }

  @Post(':id/books/:position/decision')
  @HttpCode(200)
  async decideAmbiguity(
    @Param('id') id: string,
    @Param('position') rawPosition: string,
    @Body() body: unknown,
  ): Promise<BookReconciliationDto> {
    if (!/^\d+$/u.test(rawPosition)) {
      throw new BadRequestException('The position of a book is a whole number from 0');
    }
    const decision = decisionBody.safeParse(body);
    if (!decision.success) {
      throw new BadRequestException(
        'The decision is { "choice": "candidate", "recordId": "…" } or { "choice": "none" }',
      );
    }

    return unwrapOrThrow(
      await this.decide.execute({ id, position: Number(rawPosition), decision: decision.data }),
    );
  }

  @Get(':id/reconciliation')
  async readReconciliation(@Param('id') id: string): Promise<ShelfReconciliationDto> {
    return unwrapOrThrow(await this.read.execute({ id }));
  }
}

/**
 * `POST /shelf-photos/{id}/books/{position}/decision`: the user's word on an ambiguous book
 * (contracts §3). Validated whole by `zod` (`adapters.md`), like any body that comes from outside.
 */
const decisionBody = z.discriminatedUnion('choice', [
  z.object({ choice: z.literal('candidate'), recordId: z.string().min(1) }),
  z.object({ choice: z.literal('none') }),
]);

function unwrapOrThrow<T>(result: Result<T, OrchestrationError>): T {
  if (!result.ok) {
    throw toHttpException(result.error);
  }

  return result.value;
}
