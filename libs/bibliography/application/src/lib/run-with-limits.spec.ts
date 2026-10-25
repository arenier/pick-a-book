import { CatalogUnavailable } from '@pick-a-book/bibliography-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LIMITS, RequestRunner } from './run-with-limits.js';

type Task = (signal: AbortSignal) => Promise<Result<string, CatalogUnavailable>>;

const unavailable = () => err(new CatalogUnavailable('unavailable'));

/** A task that answers after `ms`, or never if the signal comes first. */
const answersAfter =
  (ms: number, result: Result<string, CatalogUnavailable>): Task =>
  async (signal) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(result);
      }, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
        },
        { once: true },
      );
    });

/** A task that never answers: only the runner's timeout ends it. */
const hangs: Task = async () =>
  new Promise<never>(() => {
    // Never settles.
  });

/** The specs below tick a fake clock: this registers it, and puts the real one back. */
function withFakeTimers() {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

describe('RequestRunner, a request', () => {
  withFakeTimers();

  it('gives the value of a request that answers', async () => {
    const outcome = new RequestRunner(DEFAULT_LIMITS).run(answersAfter(100, ok('records')));
    await vi.advanceTimersByTimeAsync(100);

    await expect(outcome).resolves.toStrictEqual({ kind: 'ok', value: 'records' });
  });

  it('gives up on a request after 8 s and aborts it', async () => {
    let aborted = false;

    const outcome = new RequestRunner(DEFAULT_LIMITS).run(async (signal) => {
      signal.addEventListener('abort', () => {
        aborted = true;
      });
      return hangs(signal);
    });
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(outcome).resolves.toStrictEqual({ kind: 'timed_out' });
    expect(aborted).toBe(true);
  });

  it('does not give up before 8 s', async () => {
    const outcome = new RequestRunner(DEFAULT_LIMITS).run(
      answersAfter(7_900, ok('late but in time')),
    );
    await vi.advanceTimersByTimeAsync(7_900);

    await expect(outcome).resolves.toStrictEqual({ kind: 'ok', value: 'late but in time' });
  });
});

describe('RequestRunner, retries', () => {
  withFakeTimers();

  it('tries once more after an unavailable catalogue, and keeps the second answer', async () => {
    const task = vi
      .fn<Task>()
      .mockResolvedValueOnce(unavailable())
      .mockResolvedValueOnce(ok('second time'));

    const outcome = await new RequestRunner(DEFAULT_LIMITS).run(task);

    expect(outcome).toStrictEqual({ kind: 'ok', value: 'second time' });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('fails with the cause after the second unavailable answer', async () => {
    const task = vi.fn<Task>().mockResolvedValue(unavailable());

    const outcome = await new RequestRunner(DEFAULT_LIMITS).run(task);

    expect(outcome).toStrictEqual({ kind: 'failed', cause: 'unavailable' });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('never retries an answer off-contract', async () => {
    const task = vi.fn<Task>().mockResolvedValue(err(new CatalogUnavailable('invalid_response')));

    const outcome = await new RequestRunner(DEFAULT_LIMITS).run(task);

    expect(outcome).toStrictEqual({ kind: 'failed', cause: 'invalid_response' });
    expect(task).toHaveBeenCalledOnce();
  });

  it('never retries a request that timed out', async () => {
    const task = vi.fn<Task>().mockImplementation(hangs);

    const outcome = new RequestRunner(DEFAULT_LIMITS).run(task);
    await vi.advanceTimersByTimeAsync(8_000);

    await expect(outcome).resolves.toStrictEqual({ kind: 'timed_out' });
    expect(task).toHaveBeenCalledOnce();
  });
});

describe('RequestRunner, retries, part 2', () => {
  withFakeTimers();

  // Less than a second left is not a retry that can answer.
  it('does not retry once the budget is spent', async () => {
    const runner = new RequestRunner({ ...DEFAULT_LIMITS, requestTimeoutMs: 30_000 });
    const task = vi.fn<Task>().mockImplementation(answersAfter(17_500, unavailable()));

    const outcome = runner.run(task);
    await vi.advanceTimersByTimeAsync(17_500);

    await expect(outcome).resolves.toStrictEqual({ kind: 'failed', cause: 'unavailable' });
    expect(task).toHaveBeenCalledOnce();
  });
});

describe('RequestRunner, parallelism and deadline', () => {
  withFakeTimers();

  it('runs four requests at once at most', async () => {
    const runner = new RequestRunner(DEFAULT_LIMITS);
    let running = 0;
    let peak = 0;
    const task: Task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1_000);
      });
      running -= 1;
      return ok('done');
    };

    const outcomes = Promise.all(Array.from({ length: 10 }, async () => runner.run(task)));
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(outcomes).resolves.toHaveLength(10);
    expect(peak).toBe(4);
  });

  it('launches nothing after 18 s and calls the rest timed out, without a call', async () => {
    const runner = new RequestRunner(DEFAULT_LIMITS);
    const task = vi.fn<Task>().mockImplementation(hangs);

    const outcomes = Promise.all(Array.from({ length: 20 }, async () => runner.run(task)));
    await vi.advanceTimersByTimeAsync(40_000);

    expect((await outcomes).every((outcome) => outcome.kind === 'timed_out')).toBe(true);
    // Three waves of four: 8 s, 8 s, then the 2 s left. The fourth wave would start at 18 s.
    expect(task).toHaveBeenCalledTimes(12);
  });
});
