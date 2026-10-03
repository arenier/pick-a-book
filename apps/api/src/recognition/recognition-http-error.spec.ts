import {
  DailyScanQuotaExceeded,
  InvalidShelfPhoto,
  ShelfScanAlreadyProcessed,
  ShelfScanFailed,
  ShelfScanId,
  ShelfScanInProgress,
  ShelfScanNotFound,
} from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { toHttpException } from './recognition-http-error';

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

// The recognition context's errors, said in HTTP (contracts/scan-api.md). One switch, checked
// for exhaustiveness by the compiler: a new error kind fails the build here, not a test.
describe('toHttpException', () => {
  it('says InvalidShelfPhoto as 400: the photo is the caller`s mistake', () => {
    const http = toHttpException(new InvalidShelfPhoto('empty image'));

    expect(http.getStatus()).toBe(400);
    expect(http.getResponse()).toStrictEqual({
      statusCode: 400,
      message: 'ShelfPhoto: empty image',
      error: 'Bad Request',
    });
  });

  it('says ShelfScanNotFound as 404', () => {
    const http = toHttpException(new ShelfScanNotFound(anId));

    expect(http.getStatus()).toBe(404);
    expect(http.getResponse()).toStrictEqual({
      statusCode: 404,
      message: `Shelf scan not found: ${anId}`,
      error: 'Not Found',
    });
  });
});

// What the history adds (specs/002-upload-history): refusals the front must tell apart by code.
describe('toHttpException, for the refusals of an analysis', () => {
  // Two 409s now (contracts/shelf-photos-history-api.md): the code is what tells them apart.
  it('says ShelfScanAlreadyProcessed as 409 SCAN_ALREADY_COMPLETED', () => {
    const http = toHttpException(new ShelfScanAlreadyProcessed(unwrap(ShelfScanId.of(anId))));

    expect(http.getStatus()).toBe(409);
    expect(http.getResponse()).toStrictEqual({
      statusCode: 409,
      message: `Shelf scan already processed: ${anId}`,
      error: 'Conflict',
      code: 'SCAN_ALREADY_COMPLETED',
    });
  });

  it('says ShelfScanInProgress as 409 SCAN_IN_PROGRESS', () => {
    const http = toHttpException(new ShelfScanInProgress(unwrap(ShelfScanId.of(anId))));

    expect(http.getStatus()).toBe(409);
    expect(http.getResponse()).toStrictEqual({
      statusCode: 409,
      message: `Shelf scan already in progress: ${anId}`,
      error: 'Conflict',
      code: 'SCAN_IN_PROGRESS',
    });
  });

  // The photo is kept: the front tells the user it can be re-run tomorrow (FR-015).
  it('says DailyScanQuotaExceeded as 429 DAILY_SCAN_QUOTA_EXCEEDED', () => {
    const http = toHttpException(new DailyScanQuotaExceeded(50));

    expect(http.getStatus()).toBe(429);
    expect(http.getResponse()).toStrictEqual({
      statusCode: 429,
      message: 'Daily scan quota exceeded: 50 analyses a day at most',
      error: 'Too Many Requests',
      code: 'DAILY_SCAN_QUOTA_EXCEEDED',
    });
  });
});

describe('toHttpException, for a provider that fails', () => {
  // The message of a ShelfScanFailed is the provider's own answer, which can name a key, a
  // quota or a model: the caller only gets a generic one (contracts/scan-api.md §2).
  it('says ShelfScanFailed as 502, with a generic message', () => {
    const http = toHttpException(new ShelfScanFailed('Gemini answered 400 (API key not valid)'));

    expect(http.getStatus()).toBe(502);
    expect(http.getResponse()).toStrictEqual({
      statusCode: 502,
      message: 'The recognition service is unavailable',
      error: 'Bad Gateway',
    });
  });
});
