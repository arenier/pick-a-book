import {
  DailyScanQuotaExceeded,
  ShelfScanAlreadyProcessed,
  ShelfScanInProgress,
  ShelfScanNotFound,
  type DetectedBook,
  type NewShelfScan,
  type ScanAttemptPolicy,
  type ScanAttemptRefusal,
  type ShelfScanId,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
  type ShelfScanTransitionFailure,
} from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

/** One reserved analysis, as `scan_attempts` holds it. */
interface Attempt {
  readonly id: ShelfScanId;
  readonly startedAt: Date;
  readonly finishedAt: Date | undefined;
}

/**
 * In-memory double of the scan repository, holding the rules of Postgres: the transitions, and
 * the reservation of an analysis — one at a time per scan, capped per day. A twin of the double
 * in `libs/recognition/application`, which this app may not import.
 */
export class InMemoryScanRepository implements ShelfScanRepositoryPort {
  readonly records = new Map<string, ShelfScanRecord>();
  attempts: readonly Attempt[] = [];

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

  async startAttempt(
    id: ShelfScanId,
    policy: ScanAttemptPolicy,
  ): Promise<Result<void, ScanAttemptRefusal>> {
    const record = this.analysable(id);
    if (!record.ok) {
      return record;
    }
    const now = Date.now();
    if (
      this.attempts.some(
        (attempt) =>
          attempt.id.equals(id) &&
          attempt.finishedAt === undefined &&
          now - attempt.startedAt.getTime() < policy.lease,
      )
    ) {
      return err(new ShelfScanInProgress(id));
    }
    const today = dayOf(new Date(now), policy.timeZone);
    const startedToday = this.attempts.filter(
      (attempt) => dayOf(attempt.startedAt, policy.timeZone) === today,
    );
    if (startedToday.length >= policy.dailyLimit) {
      return err(new DailyScanQuotaExceeded(policy.dailyLimit));
    }
    this.attempts = [...this.attempts, { id, startedAt: new Date(now), finishedAt: undefined }];

    return ok();
  }

  async markCompleted(
    id: ShelfScanId,
    books: readonly DetectedBook[],
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    return this.settle(id, { status: 'completed', detectedBooks: books });
  }

  async markFailed(id: ShelfScanId): Promise<Result<void, ShelfScanTransitionFailure>> {
    return this.settle(id, { status: 'failed', detectedBooks: undefined });
  }

  private settle(
    id: ShelfScanId,
    outcome:
      | { status: 'completed'; detectedBooks: readonly DetectedBook[] }
      | { status: 'failed'; detectedBooks: undefined },
  ): Result<void, ShelfScanTransitionFailure> {
    const record = this.analysable(id);
    if (!record.ok) {
      return record;
    }
    this.records.set(id.value, { ...record.value, ...outcome });
    const finishedAt = new Date();
    this.attempts = this.attempts.map((attempt) =>
      attempt.id.equals(id) && attempt.finishedAt === undefined
        ? { ...attempt, finishedAt }
        : attempt,
    );

    return ok();
  }

  /** The record an id names, if it has no result yet — the transition rule of Postgres. */
  private analysable(id: ShelfScanId): Result<ShelfScanRecord, ShelfScanTransitionFailure> {
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

function dayOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
}
