import { err, ok, unwrap } from '@pick-a-book/shared-result';
import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  ShelfScanFailed,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';
import { describe, expect, it } from 'vitest';

import { errorBodyOf } from '../http/testing/error-body';
import { defaultPolicy } from './testing/shelf-photos-controller.fixture';
import { aJpeg, aRunningApi, idOf } from './testing/running-api';

/**
 * The refusals of `POST /shelf-photos/{id}/scan` that carry a stable `code`, over real HTTP
 * (specs/002-upload-history, contracts/shelf-photos-history-api.md, « Erreurs communes »).
 */

/** A promise and the way to settle it, from outside — a gate that a test opens when it wants. */
function aGate() {
  const resolvers: (() => void)[] = [];
  const opened = new Promise<void>((resolve) => {
    resolvers.push(resolve);
  });

  return {
    opened,
    open: () => {
      resolvers.forEach((resolve) => {
        resolve();
      });
    },
  };
}

/** A scanner that holds its answer until told: an analysis that is still running. */
function aSlowScanner() {
  const started = aGate();
  const released = aGate();
  const scanner: ShelfScannerPort = {
    scan: async () => {
      started.open();
      await released.opened;
      return ok<DetectedBook[]>([]);
    },
  };

  return { scanner, hasStarted: started.opened, release: released.open };
}

describe('POST /shelf-photos/:id/scan, past the daily cap', () => {
  const { upload, scan } = aRunningApi(undefined, { ...defaultPolicy, dailyLimit: 1 });

  it('answers 429 DAILY_SCAN_QUOTA_EXCEEDED, and keeps the photo for later', async () => {
    await scan(idOf(await (await upload(aJpeg())).json()));
    const refused = idOf(await (await upload(aJpeg())).json());

    const response = await scan(refused);

    expect(response.status).toBe(429);
    await expect(errorBodyOf(response)).resolves.toMatchObject({
      statusCode: 429,
      code: 'DAILY_SCAN_QUOTA_EXCEEDED',
    });
  });
});

describe('POST /shelf-photos/:id/scan, while it is already running', () => {
  const slow = aSlowScanner();
  const { upload, scan } = aRunningApi(slow.scanner);

  it('answers 409 SCAN_IN_PROGRESS to a second request', async () => {
    const id = idOf(await (await upload(aJpeg())).json());
    const first = scan(id);
    await slow.hasStarted;

    const second = await scan(id);
    slow.release();
    await first;

    expect(second.status).toBe(409);
    await expect(errorBodyOf(second)).resolves.toMatchObject({
      statusCode: 409,
      code: 'SCAN_IN_PROGRESS',
    });
  });
});

describe('POST /shelf-photos/:id/scan, once it has its books', () => {
  const { upload, scan } = aRunningApi();

  it('answers 409 SCAN_ALREADY_COMPLETED, with the uniform body', async () => {
    const id = idOf(await (await upload(aJpeg())).json());
    await scan(id);

    const response = await scan(id);

    expect(response.status).toBe(409);
    const body = await errorBodyOf(response);
    expect(body).toMatchObject({ statusCode: 409, code: 'SCAN_ALREADY_COMPLETED' });
    expect(body.message).toContain(id);
  });
});

/** A scanner that is down until told it is back: the provider of a failed analysis, then its relaunch. */
function aScannerThatComesBack() {
  let up = false;
  const book = DetectedBook.of(
    unwrap(Author.of('Albert Camus')),
    unwrap(BookTitle.of('La Peste')),
    unwrap(Confidence.of(0.92)),
  );
  const scanner: ShelfScannerPort = {
    scan: async () => (up ? ok([book]) : err(new ShelfScanFailed('provider unavailable'))),
  };

  return {
    scanner,
    comeBack: () => {
      up = true;
    },
  };
}

// specs/002-upload-history, US3, FR-011: the same route scans a photo and runs a failed one again.
describe('POST /shelf-photos/:id/scan, on an upload whose analysis failed', () => {
  const service = aScannerThatComesBack();
  const { upload, scan, get } = aRunningApi(service.scanner);

  it('runs it again, and the upload then shows its books', async () => {
    const id = idOf(await (await upload(aJpeg())).json());
    expect((await scan(id)).status).toBe(502);
    await expect(get(`/shelf-photos/${id}`).then(async (r) => r.json())).resolves.toMatchObject({
      outcome: 'failed',
    });
    service.comeBack();

    const relaunched = await scan(id);

    expect(relaunched.status).toBe(200);
    await expect(relaunched.json()).resolves.toStrictEqual({
      books: [{ author: 'Albert Camus', title: 'La Peste', confidence: 0.92 }],
    });
    await expect(get(`/shelf-photos/${id}`).then(async (r) => r.json())).resolves.toMatchObject({
      outcome: 'completed',
      books: [{ title: 'La Peste' }],
    });
  });

  it('refuses a third run: the books are final', async () => {
    const id = idOf(await (await upload(aJpeg())).json());
    service.comeBack();
    await scan(id);

    const again = await scan(id);

    expect(again.status).toBe(409);
    await expect(errorBodyOf(again)).resolves.toMatchObject({ code: 'SCAN_ALREADY_COMPLETED' });
  });
});
