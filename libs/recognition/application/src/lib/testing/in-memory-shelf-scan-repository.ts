import {
  ShelfScanAlreadyProcessed,
  ShelfScanNotFound,
  type DetectedBook,
  type NewShelfScan,
  type ShelfScanId,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
  type ShelfScanTransitionFailure,
} from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

/** Test double of `ShelfScanRepositoryPort`, holding the same transition rules as Postgres. */
export class InMemoryShelfScanRepository implements ShelfScanRepositoryPort {
  readonly records = new Map<string, ShelfScanRecord>();

  async createPending(scan: NewShelfScan): Promise<void> {
    this.records.set(scan.id.value, {
      ...scan,
      status: 'pending',
      detectedBooks: undefined,
      createdAt: new Date(),
    });
  }

  async get(id: ShelfScanId): Promise<ShelfScanRecord | undefined> {
    return this.records.get(id.value);
  }

  async markCompleted(
    id: ShelfScanId,
    books: readonly DetectedBook[],
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    const record = this.pending(id);
    if (!record.ok) {
      return record;
    }
    this.records.set(id.value, { ...record.value, status: 'completed', detectedBooks: books });

    return ok();
  }

  async markFailed(id: ShelfScanId): Promise<Result<void, ShelfScanTransitionFailure>> {
    const record = this.pending(id);
    if (!record.ok) {
      return record;
    }
    this.records.set(id.value, { ...record.value, status: 'failed', detectedBooks: undefined });

    return ok();
  }

  private pending(id: ShelfScanId): Result<ShelfScanRecord, ShelfScanTransitionFailure> {
    const record = this.records.get(id.value);
    if (record === undefined) {
      return err(new ShelfScanNotFound(id.value));
    }
    if (record.status !== 'pending') {
      return err(new ShelfScanAlreadyProcessed(id));
    }

    return ok(record);
  }
}
