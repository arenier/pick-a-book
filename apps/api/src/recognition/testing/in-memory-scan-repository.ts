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
  type ShelfScanPage,
  type ShelfScanPageQuery,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
  type ShelfScanTransitionFailure,
} from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

/** One reserved analysis, as `scan_attempts` holds it. */
export interface Attempt {
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
      thumbnail: scan.thumbnail,
    });
  }

  async get(id: ShelfScanId): Promise<ShelfScanRecord | undefined> {
    return this.records.get(id.value);
  }

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

/** Orders by date, newest first, then by id, highest first — what `created_at desc, id desc` is. */
function compareNewestFirst(
  a: { readonly createdAt: Date; readonly id: ShelfScanId },
  b: { readonly createdAt: Date; readonly id: ShelfScanId },
): number {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();

  return byDate === 0 ? b.id.value.localeCompare(a.id.value) : byDate;
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
