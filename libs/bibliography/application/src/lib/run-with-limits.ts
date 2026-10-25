import type { CatalogUnavailable, CatalogUnavailableCause } from '@pick-a-book/bibliography-domain';
import type { Result } from '@pick-a-book/shared-result';

/**
 * The limits of one reconciliation (research §7). Injected by the composition root: the bench
 * measures them on real photos and may move them.
 */
export interface ReconciliationLimits {
  /** Requests to the catalogue in flight at once, whatever the books they serve. */
  readonly parallelism: number;
  readonly requestTimeoutMs: number;
  /** After this, nothing is launched: the books left are « not verified ». */
  readonly deadlineMs: number;
}

export const DEFAULT_LIMITS: ReconciliationLimits = {
  parallelism: 4,
  requestTimeoutMs: 8_000,
  deadlineMs: 18_000,
};

/** A retry that has less than this left cannot answer in time: it is not attempted. */
const MIN_RETRY_BUDGET_MS = 1_000;

export type RunOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'failed'; readonly cause: CatalogUnavailableCause }
  | { readonly kind: 'timed_out' };

type Task<T> = (signal: AbortSignal) => Promise<Result<T, CatalogUnavailable>>;

/**
 * Runs the requests of one reconciliation under its limits: four at a time, 8 s each, one more
 * try after an `unavailable` answer if the budget allows, and nothing launched after the
 * deadline. Without a dependency — `application` allows none beyond `tslib` — and without a
 * clock of its own: it reads `Date.now()` and the timers, which the specs fake.
 *
 * One runner per reconciliation: its deadline starts when it is built.
 */
export class RequestRunner {
  private readonly deadline: number;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limits: ReconciliationLimits) {
    this.deadline = Date.now() + limits.deadlineMs;
  }

  /** Whether the budget is spent: the books not yet served are not worth a request. */
  get spent(): boolean {
    return Date.now() >= this.deadline;
  }

  async run<T>(task: Task<T>): Promise<RunOutcome<T>> {
    await this.acquire();
    try {
      return await this.attempt(task, true);
    } finally {
      this.release();
    }
  }

  private async attempt<T>(task: Task<T>, mayRetry: boolean): Promise<RunOutcome<T>> {
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) {
      return { kind: 'timed_out' };
    }

    const result = await this.withTimeout(task, Math.min(this.limits.requestTimeoutMs, remaining));
    if (result === 'timed_out') {
      return { kind: 'timed_out' };
    }
    if (result.ok) {
      return { kind: 'ok', value: result.value };
    }
    if (
      mayRetry &&
      result.error.cause === 'unavailable' &&
      this.deadline - Date.now() >= MIN_RETRY_BUDGET_MS
    ) {
      return this.attempt(task, false);
    }

    return { kind: 'failed', cause: result.error.cause };
  }

  private async withTimeout<T>(
    task: Task<T>,
    timeoutMs: number,
  ): Promise<Result<T, CatalogUnavailable> | 'timed_out'> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<'timed_out'>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve('timed_out');
      }, timeoutMs);
    });

    try {
      return await Promise.race([task(controller.signal), expired]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limits.parallelism) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next === undefined) {
      this.active -= 1;
    } else {
      // The slot passes on to the next request without being freed.
      next();
    }
  }
}
