import { describe, expect, it } from 'vitest';

import { aRunningApplication } from './testing/running-application';

const anUnknownScan = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

/**
 * The limit counts a source, not a route (specs/002-upload-history, FR-014): `@nestjs/throttler`
 * keys its counter on the handler by default, so each route would have a budget of its own.
 */
const { from } = aRunningApplication();

describe('rate limiting, one budget per source and tier', () => {
  it('shares the write budget between two write routes', async () => {
    const source = '10.1.0.1';
    await Promise.all(
      Array.from({ length: 10 }, async () =>
        from(source, `/shelf-photos/${anUnknownScan}/scan`, 'POST'),
      ),
    );

    const other = await from(source, '/shelf-photos', 'POST');

    expect(other.status).toBe(429);
  });

  it('shares the read budget between two read routes', async () => {
    const source = '10.1.0.2';
    await Promise.all(Array.from({ length: 300 }, async () => from(source, '/probe')));

    const other = await from(source, `/shelf-photos/${anUnknownScan}/thumbnail`);

    expect(other.status).toBe(429);
  });
});
