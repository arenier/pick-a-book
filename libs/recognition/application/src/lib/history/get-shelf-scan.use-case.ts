import {
  ShelfScanNotFound,
  type OwnerId,
  type ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

import { findOwnedScan } from '../owned-shelf-scan.js';
import type { GetShelfScanCommand, ShelfScanDetailDto } from '../dto/shelf-scan-history.dto.js';
import { toDetailDto } from '../dto/to-shelf-scan-dto.js';

/**
 * The detail of one upload: how its analysis ended and, when it completed, the books it found, in
 * the order it gave them (specs/002-upload-history, US2, FR-007). It is the configured owner's:
 * an unknown id, a malformed one and someone else's are the same « not found » (FR-012). Reads
 * only (FR-013).
 */
export class GetShelfScanUseCase {
  constructor(
    private readonly ownerId: OwnerId,
    private readonly repository: ShelfScanRepositoryPort,
  ) {}

  async execute(
    command: GetShelfScanCommand,
  ): Promise<Result<ShelfScanDetailDto, ShelfScanNotFound>> {
    const record = await findOwnedScan(this.repository, this.ownerId, command.id);

    return record === undefined ? err(new ShelfScanNotFound(command.id)) : ok(toDetailDto(record));
  }
}
