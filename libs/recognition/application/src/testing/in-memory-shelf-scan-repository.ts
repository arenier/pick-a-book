import {
  DailyScanQuotaExceeded,
  DailyUploadQuotaExceeded,
  ShelfScanAlreadyProcessed,
  ShelfScanInProgress,
  ScanAttemptId,
  ShelfScanNotFound,
  type DetectedBook,
  type NewShelfScan,
  type ScanAttemptPolicy,
  type ScanAttemptRefusal,
  type ShelfScanId,
  type ShelfScanPage,
  type ShelfScanPageQuery,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
  type ShelfScanTransitionFailure,
  type OwnerId,
  type UploadQuotaPolicy,
} from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

/** One reserved analysis, as `scan_attempts` holds it. */
export interface ScanAttempt {
  readonly id: ScanAttemptId;
  readonly scanId: ShelfScanId;
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

  async checkUploadQuota(
    ownerId: OwnerId,
    policy: UploadQuotaPolicy,
  ): Promise<Result<void, DailyUploadQuotaExceeded>> {
    const today = dayOf(this.now(), policy.timeZone);
    const uploadsToday = [...this.records.values()].filter(
      (record) =>
        record.ownerId.equals(ownerId) && dayOf(record.createdAt, policy.timeZone) === today,
    );

    return uploadsToday.length >= policy.dailyLimit
      ? err(new DailyUploadQuotaExceeded(policy.dailyLimit))
      : ok();
  }

  async createPending(scan: NewShelfScan): Promise<void> {
    this.records.set(scan.id.value, {
      ...scan,
      status: 'pending',
      detectedBooks: undefined,
      createdAt: this.now(),
      thumbnail: scan.thumbnail,
    });
  }

  async get(id: ShelfScanId): Promise<ShelfScanRecord | undefined> {
    return this.records.get(id.value);
  }

  /** Newest first by date then id, after the cursor, one page and the cursor of the next. */
  async list(query: ShelfScanPageQuery): Promise<ShelfScanPage> {
    const { after } = query;
    const newestFirst = [...this.records.values()]
      .filter((record) => record.ownerId.equals(query.ownerId))
      .reduce<ShelfScanRecord[]>((sorted, record) => insertNewestFirst(sorted, record), []);
    const remaining =
      after === undefined
        ? newestFirst
        : newestFirst.filter((record) => compareNewestFirst(record, after) > 0);
    const records = remaining.slice(0, query.limit);
    const last = records.at(-1);

    return {
      records,
      next: remaining.length > records.length && last !== undefined ? last : undefined,
    };
  }

  async startAttempt(
    id: ShelfScanId,
    policy: ScanAttemptPolicy,
  ): Promise<Result<ScanAttemptId, ScanAttemptRefusal>> {
    const record = this.analysable(id);
    if (!record.ok) {
      return record;
    }

    const now = this.now();
    const inProgress = this.attempts.some(
      (attempt) =>
        attempt.scanId.equals(id) &&
        attempt.finishedAt === undefined &&
        now.getTime() - attempt.startedAt.getTime() < policy.lease,
    );
    if (inProgress) {
      return err(new ShelfScanInProgress(id));
    }

    const today = dayOf(now, policy.timeZone);
    const startedToday = this.attempts.filter(
      (attempt) =>
        this.records.get(attempt.scanId.value)?.ownerId.equals(record.value.ownerId) === true &&
        dayOf(attempt.startedAt, policy.timeZone) === today,
    );
    if (startedToday.length >= policy.dailyLimit) {
      return err(new DailyScanQuotaExceeded(policy.dailyLimit));
    }

    const attempt = ScanAttemptId.generate();
    this.attempts = [
      ...this.attempts,
      { id: attempt, scanId: id, startedAt: now, finishedAt: undefined },
    ];

    return ok(attempt);
  }

  async markCompleted(
    id: ShelfScanId,
    attempt: ScanAttemptId,
    books: readonly DetectedBook[],
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    const record = this.analysable(id);
    if (!record.ok) {
      return record;
    }
    this.records.set(id.value, { ...record.value, status: 'completed', detectedBooks: books });
    this.closeAttempt(attempt);

    return ok();
  }

  async markFailed(
    id: ShelfScanId,
    attempt: ScanAttemptId,
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    const record = this.analysable(id);
    if (!record.ok) {
      return record;
    }
    this.records.set(id.value, { ...record.value, status: 'failed', detectedBooks: undefined });
    this.closeAttempt(attempt);

    return ok();
  }

  /** The record an id names, if it can still be analysed: it has no books yet. */
  private analysable(id: ShelfScanId): Result<ShelfScanRecord, ShelfScanTransitionFailure> {
    const record = this.records.get(id.value);
    if (record === undefined) {
      return err(new ShelfScanNotFound(id.value));
    }
    if (record.status === 'completed') {
      return err(new ShelfScanAlreadyProcessed(id));
    }

    return ok(record);
  }

  /** Closes the attempt it is given — never another open one of the same scan. */
  private closeAttempt(closing: ScanAttemptId): void {
    const finishedAt = this.now();
    this.attempts = this.attempts.map((attempt) =>
      attempt.id.equals(closing) && attempt.finishedAt === undefined
        ? { ...attempt, finishedAt }
        : attempt,
    );
  }
}

/** The calendar day an instant falls on, in a time zone — what « per day » is counted over. */
function dayOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
}

/** Orders by date, newest first, then by id, highest first — what `created_at desc, id desc` is. */
function compareNewestFirst(
  a: { readonly createdAt: Date; readonly id: ShelfScanId },
  b: { readonly createdAt: Date; readonly id: ShelfScanId },
): number {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  if (byDate !== 0) {
    return byDate;
  }

  return b.id.value.localeCompare(a.id.value);
}

/** Puts a record where it belongs in a list already newest first — a sort that mutates nothing. */
function insertNewestFirst(
  sorted: readonly ShelfScanRecord[],
  record: ShelfScanRecord,
): ShelfScanRecord[] {
  const index = sorted.findIndex((other) => compareNewestFirst(record, other) < 0);

  return index === -1
    ? [...sorted, record]
    : [...sorted.slice(0, index), record, ...sorted.slice(index)];
}
