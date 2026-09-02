import { ShelfPhoto, ShelfScanFailed } from '@pick-a-book/recognition-domain';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { QwenShelfScannerAdapter } from './qwen-shelf-scanner.adapter.js';
import recorded from './recorded/qwen-shelf-scan.json' with { type: 'json' };

/** Proves the shape of the request before reading into it — the convention forbids `as`. */
const chatRequestSchema = z.object({
  model: z.string(),
  temperature: z.number(),
  response_format: z.object({
    type: z.string(),
    json_schema: z
      .object({
        name: z.string(),
        strict: z.boolean(),
        schema: z.object({ required: z.array(z.string()) }),
      })
      .optional(),
  }),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.array(
        z.object({
          type: z.string(),
          text: z.string().optional(),
          image_url: z.object({ url: z.string() }).optional(),
        }),
      ),
    }),
  ),
});

const photo = ShelfPhoto.of(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg');

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
  new QwenShelfScannerAdapter({ apiKey: 'test-key' }, transport);

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

describe('QwenShelfScannerAdapter', () => {
  // The fixture is hand-written, not captured: openrouter.ai is unreachable from the
  // environment this adapter was built in. See recorded/README.md — the contract tests below
  // therefore prove the adapter against the envelope we assume, not one we observed.
  it('maps a recorded answer onto detected books', async () => {
    const books = await adapterWith(respondWith(recorded)).scan(photo);

    expect(books).toHaveLength(2);
    expect(books[0]?.author.value).toBe('Marguerite Duras');
    expect(books[0]?.title.value).toBe("L'Amant");
    expect(books[0]?.confidence.value).toBeCloseTo(0.94);
  });
});

describe('QwenShelfScannerAdapter builds its request', () => {
  // The whole reason this adapter is an OpenAI-compatible client: pointing it at another
  // endpoint (a local Ollama, say) is configuration, not code (issue #10).
  it('talks to the configured endpoint', async () => {
    const transport = respondWith(recorded);
    await new QwenShelfScannerAdapter(
      { apiKey: 'k', baseUrl: 'http://localhost:11434/v1' },
      transport,
    ).scan(photo);

    expect(requestOf(transport).url).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('sends the image as a base64 data URL carrying its media type', async () => {
    const transport = respondWith(recorded);
    await adapterWith(transport).scan(photo);

    const request = chatRequestSchema.parse(JSON.parse(requestOf(transport).body));
    expect(request.messages[0]?.content[1]?.image_url?.url).toBe('data:image/jpeg;base64,/9j/4A==');
  });

  it('authenticates with a bearer token and constrains the answer to the schema', async () => {
    const transport = respondWith(recorded);
    await adapterWith(transport).scan(photo);
    const { url, body, headers } = requestOf(transport);

    expect(headers.get('authorization')).toBe('Bearer test-key');
    expect(url).not.toContain('test-key');

    // json_schema, not json_object: free-form JSON let the model truncate and emit empty
    // fields on dense shelves (issue #10). The schema is the same contract Gemini decodes
    // against, so the two providers are held to one shape.
    const request = chatRequestSchema.parse(JSON.parse(body));
    expect(request.response_format.type).toBe('json_schema');
    expect(request.response_format.json_schema?.strict).toBe(true);
    expect(request.response_format.json_schema?.schema.required).toContain('books');
    expect(request.temperature).toBe(0);
  });

  it('reports an empty shelf as an empty array, not a failure', async () => {
    const empty = { choices: [{ message: { content: '{"books":[]}' } }] };

    await expect(adapterWith(respondWith(empty)).scan(photo)).resolves.toStrictEqual([]);
  });
});

describe('QwenShelfScannerAdapter fails with ShelfScanFailed', () => {
  it('when the provider answers a non-2xx status', async () => {
    const transport = respondWith({ error: { message: 'rate limited' } }, 429);

    await expect(adapterWith(transport).scan(photo)).rejects.toThrow(ShelfScanFailed);
  });

  it('when the envelope carries no choice', async () => {
    await expect(adapterWith(respondWith({ choices: [] })).scan(photo)).rejects.toThrow(
      ShelfScanFailed,
    );
  });

  it('when the model answers prose instead of JSON', async () => {
    const prose = { choices: [{ message: { content: 'Two books, I think.' } }] };

    await expect(adapterWith(respondWith(prose)).scan(photo)).rejects.toThrow(ShelfScanFailed);
  });

  it('when the transport itself rejects', async () => {
    const transport = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error('ECONNRESET');
    });

    await expect(adapterWith(transport).scan(photo)).rejects.toThrow(ShelfScanFailed);
  });
});
