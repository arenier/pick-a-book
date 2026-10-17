import { describe, expect, it } from 'vitest';

import { aRunningApplication } from './testing/running-application';
import { errorBodyOf } from './testing/error-body';

/**
 * Rate limiting by source (specs/002-upload-history, FR-014, research.md §9), against the real
 * `AppModule`: the guard is global, so only the assembled application proves it is on every
 * route and off `/health`.
 */

const anUnknownScan = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

const { from } = aRunningApplication();

const scanFrom = async (source: string) =>
  from(source, `/shelf-photos/${anUnknownScan}/scan`, 'POST');

/** Sends `count` requests one after the other and answers the last response. */
async function repeat(count: number, send: () => Promise<Response>): Promise<Response> {
  const responses = await Promise.all(Array.from({ length: count }, async () => send()));

  return responses[count - 1] ?? send();
}

describe('rate limiting, writes', () => {
  it('lets 10 writes a minute through, and refuses the 11th with 429 TOO_MANY_REQUESTS', async () => {
    const source = '10.0.0.1';
    const tenth = await repeat(10, async () => scanFrom(source));

    const eleventh = await scanFrom(source);

    expect(tenth.status).not.toBe(429);
    expect(eleventh.status).toBe(429);
    await expect(errorBodyOf(eleventh)).resolves.toMatchObject({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('does not limit another source', async () => {
    await repeat(11, async () => scanFrom('10.0.0.2'));

    expect((await scanFrom('10.0.0.3')).status).not.toBe(429);
  });

  it('answers a Retry-After header, in seconds, named without any suffix', async () => {
    const source = '10.0.0.4';
    await repeat(10, async () => scanFrom(source));

    const refused = await scanFrom(source);

    expect(refused.headers.get('retry-after')).toMatch(/^\d+$/u);
    expect(
      [...refused.headers.keys()].filter((name) => name.startsWith('retry-after')),
    ).toStrictEqual(['retry-after']);
  });
});

describe('rate limiting, reads', () => {
  it('lets 300 reads a minute through, and refuses the 301st', async () => {
    const source = '10.0.1.1';
    await repeat(300, async () => from(source, '/probe'));

    const refused = await from(source, '/probe');

    expect(refused.status).toBe(429);
    await expect(errorBodyOf(refused)).resolves.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('answers the same unsuffixed Retry-After for the default tier', async () => {
    const source = '10.0.1.2';
    await repeat(300, async () => from(source, '/probe'));

    const refused = await from(source, '/probe');

    expect(refused.headers.get('retry-after')).toMatch(/^\d+$/u);
  });

  it('never limits the reads against the write tier', async () => {
    const source = '10.0.1.3';

    const answers = await Promise.all(
      Array.from({ length: 30 }, async () => from(source, '/probe')),
    );

    expect(answers.map((answer) => answer.status)).toStrictEqual(
      Array.from({ length: 30 }, () => 200),
    );
  });
});

describe('rate limiting, the health probe', () => {
  // The startup probe of Cloud Run must never be told to back off.
  it('answers 200 well past 300 requests a minute', async () => {
    const last = await repeat(320, async () => from('10.0.2.1', '/health'));

    expect(last.status).toBe(200);
  });
});

describe('rate limiting, who the source is', () => {
  // `trust proxy` = 1: Cloud Run appends the client's address, which the client cannot forge —
  // it only controls the entries on the left.
  it('counts the last address of X-Forwarded-For, whatever the client wrote before it', async () => {
    await repeat(5, async () => scanFrom('9.9.9.9, 2.2.2.2'));
    await repeat(5, async () => scanFrom('1.1.1.1, 2.2.2.2'));

    expect((await scanFrom('8.8.8.8, 2.2.2.2')).status).toBe(429);
  });

  // The other half of the same rule: a client that varies what it writes on the left does not
  // become a new source, and one that varies what Cloud Run appends does. Without `trust proxy`
  // every request would be the socket's address, and these two would be the same source.
  it('tells two sources apart by the last address alone', async () => {
    await repeat(10, async () => scanFrom('7.7.7.7, 4.4.4.4'));

    expect((await scanFrom('7.7.7.7, 4.4.4.4')).status).toBe(429);
    expect((await scanFrom('7.7.7.7, 5.5.5.5')).status).not.toBe(429);
  });
});
