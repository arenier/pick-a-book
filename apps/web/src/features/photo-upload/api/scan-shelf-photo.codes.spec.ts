import { describe, expect, it } from 'vitest';

import { submitShelfPhoto } from './scan-shelf-photo';

/**
 * The two 429 of the API tell the user different things, and only their `code` says which
 * (specs/002-upload-history, research.md §10): the daily cap keeps the photo for tomorrow, the
 * limit by source asks for a minute. The `message` is never read.
 */
const aPhoto = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], 'IMG_0001.jpg', { type: 'image/jpeg' });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

/** A server that stores the photo, then answers the scan with `scan`. */
const storingThen = (scan: () => Response) => {
  const answers = [() => json(201, { id: anId }), scan];
  let call = 0;

  return async () => answers[call++]?.() ?? json(500, {});
};

const submit = async (fetchDouble: typeof fetch) =>
  submitShelfPhoto(aPhoto(), { baseUrl: 'http://api.test', fetch: fetchDouble });

describe('submitShelfPhoto, on a 429 of the scan', () => {
  it('reads DAILY_SCAN_QUOTA_EXCEEDED as the daily cap', async () => {
    const state = await submit(
      storingThen(() => json(429, { statusCode: 429, code: 'DAILY_SCAN_QUOTA_EXCEEDED' })),
    );

    expect(state).toStrictEqual({ status: 'error', failure: 'dailyQuota' });
  });

  it('reads TOO_MANY_REQUESTS as the limit by source', async () => {
    const state = await submit(
      storingThen(() => json(429, { statusCode: 429, code: 'TOO_MANY_REQUESTS' })),
    );

    expect(state).toStrictEqual({ status: 'error', failure: 'rateLimited' });
  });

  it.each([
    ['no code', { statusCode: 429, message: 'Daily scan quota exceeded' }],
    ['an unknown code', { statusCode: 429, code: 'SOMETHING_NEW' }],
    ['a code that is not a string', { statusCode: 429, code: 42 }],
  ])('reads %s as an unexpected failure', async (_label, body) => {
    const state = await submit(storingThen(() => json(429, body)));

    expect(state).toStrictEqual({ status: 'error', failure: 'unexpected' });
  });

  it('does not read the message', async () => {
    const state = await submit(
      storingThen(() => json(429, { code: 'TOO_MANY_REQUESTS', message: 'Daily scan quota' })),
    );

    expect(state).toStrictEqual({ status: 'error', failure: 'rateLimited' });
  });
});

describe('submitShelfPhoto, on a 429 of the storing', () => {
  it('reads TOO_MANY_REQUESTS as the limit by source', async () => {
    const state = await submit(async () => json(429, { code: 'TOO_MANY_REQUESTS' }));

    expect(state).toStrictEqual({ status: 'error', failure: 'rateLimited' });
  });
});
