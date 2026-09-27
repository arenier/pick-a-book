import {
  ShelfScanAlreadyProcessed,
  ShelfScanNotFound,
  type DetectedBook,
  type NewShelfScan,
  type ShelfScanId,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';

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

  async markCompleted(id: ShelfScanId, books: readonly DetectedBook[]): Promise<void> {
    const record = this.pending(id);
    this.records.set(id.value, { ...record, status: 'completed', detectedBooks: books });
  }

  async markFailed(id: ShelfScanId): Promise<void> {
    const record = this.pending(id);
    this.records.set(id.value, { ...record, status: 'failed', detectedBooks: undefined });
  }

  private pending(id: ShelfScanId): ShelfScanRecord {
    const record = this.records.get(id.value);
    if (record === undefined) {
      throw new ShelfScanNotFound(id.value);
    }
    if (record.status !== 'pending') {
      throw new ShelfScanAlreadyProcessed(id);
    }

    return record;
  }
}
