import { ShelfPhoto, ShelfScanFailed } from '@pick-a-book/recognition-domain';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { GeminiShelfScannerAdapter } from './gemini-shelf-scanner.adapter.js';
import recorded from './recorded/gemini-shelf-scan.json' with { type: 'json' };

/** Proves the shape of the request before reading into it — the convention forbids `as`. */
const geminiRequestSchema = z.object({
  contents: z.array(
    z.object({
      parts: z.array(
        z.object({
          inline_data: z.object({ mime_type: z.string(), data: z.string() }).optional(),
        }),
      ),
    }),
  ),
  generationConfig: z.object({ response_mime_type: z.string() }),
});

const photo = ShelfPhoto.of(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg');

/** Stands in for `fetch`, answering a recorded body — no network, no key, no cost. */
function respondWith(body: unknown, status = 200) {
  return vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

const adapterWith = (transport: typeof globalThis.fetch) =>
  new GeminiShelfScannerAdapter({ apiKey: 'test-key' }, transport);

/**
 * Reads back the single request the adapter issued, already narrowed.
 *
 * The narrowing lives here rather than in the tests: `fetch` accepts a string, a `URL` or a
 * `Request`, and a body of half a dozen shapes, none of which stringify meaningfully on
 * their own. Proving it once keeps every test free of a branch.
 */
function requestOf(transport: ReturnType<typeof respondWith>): {
  url: string;
  body: string;
  headers: Headers;
} {
  const call = transport.mock.calls.at(0);
  if (call === undefined) {
    throw new Error('the transport was never called');
  }

  const [target, init] = call;
  const url =
    typeof target === 'string' ? target : target instanceof URL ? target.href : target.url;
  const body = init?.body;
  if (typeof body !== 'string') {
    throw new TypeError('the adapter is expected to send a JSON string body');
  }

  return { url, body, headers: new Headers(init?.headers) };
}

describe('GeminiShelfScannerAdapter', () => {
  // `recorded/gemini-shelf-scan.json` is a real answer, captured once against
  // gemini-3.6-flash on a reference photo, then replayed forever: no network, no key, no
  // cost, whatever the number of runs (ADR 0005).
  it('maps a recorded answer onto detected books', async () => {
    const books = await adapterWith(respondWith(recorded)).scan(photo);

    expect(books).toHaveLength(31);
    expect(books[0]?.author?.value).toBe('Elizabeth Aston');
    expect(books[0]?.title.value).toBe('Les Filles de Mr Darcy');
    expect(books[0]?.confidence.value).toBeCloseTo(0.95);
  });
});

describe('GeminiShelfScannerAdapter builds its request', () => {
  it('sends the image inline, base64-encoded, with its media type', async () => {
    const transport = respondWith(recorded);
    await adapterWith(transport).scan(photo);
    const { url, body } = requestOf(transport);

    expect(url).toContain('generativelanguage.googleapis.com');

    // The prompt comes first, the image second — the order the request is built in.
    const request = geminiRequestSchema.parse(JSON.parse(body));
    expect(request.contents[0]?.parts[1]?.inline_data).toStrictEqual({
      mime_type: 'image/jpeg',
      data: '/9j/4A==',
    });
  });

  // The key is a secret: it belongs in a header, not in a URL that lands in access logs.
  it('carries the key in a header, never in the URL', async () => {
    const transport = respondWith(recorded);
    await adapterWith(transport).scan(photo);
    const { url, headers } = requestOf(transport);

    expect(url).not.toContain('test-key');
    expect(headers.get('x-goog-api-key')).toBe('test-key');
  });

  it('asks for a schema-constrained JSON answer', async () => {
    const transport = respondWith(recorded);
    await adapterWith(transport).scan(photo);

    const request = geminiRequestSchema.parse(JSON.parse(requestOf(transport).body));
    expect(request.generationConfig.response_mime_type).toBe('application/json');
  });

  it('reports an empty shelf as an empty array, not a failure', async () => {
    const empty = { candidates: [{ content: { parts: [{ text: '{"books":[]}' }] } }] };

    await expect(adapterWith(respondWith(empty)).scan(photo)).resolves.toStrictEqual([]);
  });
});

describe('GeminiShelfScannerAdapter fails with ShelfScanFailed', () => {
  it('when the provider answers a non-2xx status', async () => {
    const transport = respondWith({ error: { message: 'quota exceeded' } }, 429);

    await expect(adapterWith(transport).scan(photo)).rejects.toThrow(ShelfScanFailed);
  });

  it('when the envelope carries no text part', async () => {
    await expect(adapterWith(respondWith({ candidates: [] })).scan(photo)).rejects.toThrow(
      ShelfScanFailed,
    );
  });

  it('when the model answers prose instead of JSON', async () => {
    const prose = { candidates: [{ content: { parts: [{ text: 'I see three books.' }] } }] };

    await expect(adapterWith(respondWith(prose)).scan(photo)).rejects.toThrow(ShelfScanFailed);
  });

  // A transport that rejects must not surface as a raw network error: callers of the port
  // are promised ShelfScanFailed and nothing else.
  it('when the transport itself rejects', async () => {
    const transport = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error('ECONNRESET');
    });

    await expect(adapterWith(transport).scan(photo)).rejects.toThrow(ShelfScanFailed);
  });
});
