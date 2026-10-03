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
export interface ScanAttempt {
  readonly id: ShelfScanId;
  readonly startedAt: Date;
  readonly finishedAt: Date | undefined;
}

/**
 * Test double of `ShelfScanRepositoryPort`, holding the same rules as Postgres: the
 * transitions, and the reservation of an analysis — one at a time per scan, capped per day.
 * The clock is injectable so a spec can turn the day, or let a lease run out.
 */
export class InMemoryShelfScanRepository implements ShelfScanRepositoryPort {
  readonly records = new Map<string, ShelfScanRecord>();
  attempts: readonly ScanAttempt[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createPending(scan: NewShelfScan): Promise<void> {
    this.records.set(scan.id.value, {
      ...scan,
      status: 'pending',
      detectedBooks: undefined,
      createdAt: this.now(),
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

    const now = this.now();
    const inProgress = this.attempts.some(
      (attempt) =>
        attempt.id.equals(id) &&
        attempt.finishedAt === undefined &&
        now.getTime() - attempt.startedAt.getTime() < policy.lease,
    );
    if (inProgress) {
      return err(new ShelfScanInProgress(id));
    }

    const today = dayOf(now, policy.timeZone);
    const startedToday = this.attempts.filter(
      (attempt) =>
        this.records.get(attempt.id.value)?.ownerId.equals(record.value.ownerId) === true &&
        dayOf(attempt.startedAt, policy.timeZone) === today,
    );
    if (startedToday.length >= policy.dailyLimit) {
      return err(new DailyScanQuotaExceeded(policy.dailyLimit));
    }

    this.attempts = [...this.attempts, { id, startedAt: now, finishedAt: undefined }];

    return ok();
  }

  async markCompleted(
    id: ShelfScanId,
    books: readonly DetectedBook[],
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    const record = this.analysable(id);
    if (!record.ok) {
      return record;
    }
    this.records.set(id.value, { ...record.value, status: 'completed', detectedBooks: books });
    this.closeAttempts(id);

    return ok();
  }

  async markFailed(id: ShelfScanId): Promise<Result<void, ShelfScanTransitionFailure>> {
    const record = this.analysable(id);
    if (!record.ok) {
      return record;
    }
    this.records.set(id.value, { ...record.value, status: 'failed', detectedBooks: undefined });
    this.closeAttempts(id);

    return ok();
  }

  /** The record an id names, if it can still be analysed: it has no result yet. */
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

  private closeAttempts(id: ShelfScanId): void {
    const finishedAt = this.now();
    this.attempts = this.attempts.map((attempt) =>
      attempt.id.equals(id) && attempt.finishedAt === undefined
        ? { ...attempt, finishedAt }
        : attempt,
    );
  }
}

/** The calendar day an instant falls on, in a time zone — what « per day » is counted over. */
function dayOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
}
