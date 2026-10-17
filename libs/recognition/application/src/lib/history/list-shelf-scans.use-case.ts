import type { OwnerId, ShelfScanRepositoryPort } from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

import type { InvalidShelfScanCursor } from './invalid-shelf-scan-cursor.error.js';
import { InvalidShelfScanPageSize } from './invalid-shelf-scan-page-size.error.js';
import { decodeCursor, encodeCursor } from './shelf-scan-cursor.js';
import type { ListShelfScansCommand, ShelfScanPageDto } from '../dto/shelf-scan-history.dto.js';
import { toSummaryDto } from '../dto/to-shelf-scan-dto.js';

/** Why a page of the history was not given: the caller's page size or cursor — each a 400. */
export type ListShelfScansFailure = InvalidShelfScanPageSize | InvalidShelfScanCursor;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/**
 * One page of the history, newest first (specs/002-upload-history, US1). It is the configured
 * owner's: access is open, and there is no one else yet (FR-012). Reads only — listing does not
 * touch a scan, an attempt or the bucket (FR-013).
 *
 * The page size and the cursor come from a query string anyone can edit: both are proven, and a
 * bad one is an `Err` (ADR 0013), not a page of something else.
 */
export class ListShelfScansUseCase {
  constructor(
    private readonly ownerId: OwnerId,
    private readonly repository: ShelfScanRepositoryPort,
  ) {}

  async execute(
    command: ListShelfScansCommand,
  ): Promise<Result<ShelfScanPageDto, ListShelfScansFailure>> {
    const limit = command.limit ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return err(new InvalidShelfScanPageSize());
    }

    const after = command.cursor === undefined ? undefined : decodeCursor(command.cursor);
    if (after !== undefined && !after.ok) {
      return after;
    }

    const page = await this.repository.list({
      ownerId: this.ownerId,
      limit,
      after: after?.value,
    });

    return ok({
      items: page.records.map((record) => toSummaryDto(record)),
      nextCursor: page.next === undefined ? null : encodeCursor(page.next),
    });
  }
}
