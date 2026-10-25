import { CatalogQuery, type CatalogQueryInput } from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { BnfSruCatalogAdapter } from './bnf-sru-catalog.adapter.js';
import { searchUrl } from './sru-url.js';
import { fixture } from './testing-fixtures.js';

const BASE = 'https://catalogue.bnf.fr/api/SRU';
const query = (input: CatalogQueryInput) => unwrap(CatalogQuery.of(input));
const yacoubian = query({
  title: "L'Immeuble Yacoubian",
  author: 'Alaa El Aswany',
  maxRecords: 20,
  format: 'full',
});

/** A `fetch` that answers with a recorded body, and remembers what it was asked. */
function replying(body: string, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status }));
}

describe('BnfSruCatalogAdapter, a recorded answer', () => {
  it('reads the page of a recorded answer', async () => {
    const adapter = new BnfSruCatalogAdapter({
      fetch: replying(fixture('yacoubian-title-and-author')),
    });

    const page = unwrap(await adapter.search(yacoubian, new AbortController().signal));

    expect(page.records).toHaveLength(4);
    expect(page.records[0].title).toBe("L'immeuble Yacoubian");
  });

  it('is named after the catalogue it asks', () => {
    expect(new BnfSruCatalogAdapter().name.value).toBe('bnf');
  });

  it('reads an empty page as nothing found, not as a failure', async () => {
    const adapter = new BnfSruCatalogAdapter({ fetch: replying(fixture('fabricated-title-only')) });

    const page = unwrap(
      await adapter.search(
        query({ title: 'Rien', maxRecords: 20, format: 'full' }),
        new AbortController().signal,
      ),
    );

    expect(page.records).toStrictEqual([]);
  });

  it('reads a light query as Dublin Core', async () => {
    const adapter = new BnfSruCatalogAdapter({ fetch: replying(fixture('queneau-author-only')) });

    const page = unwrap(
      await adapter.search(
        query({ author: 'Raymond Queneau', maxRecords: 100, format: 'light' }),
        new AbortController().signal,
      ),
    );

    expect(page.records).toHaveLength(100);
    expect(page.records[0].format).toBe('dublin-core');
  });
});

describe('BnfSruCatalogAdapter, the request', () => {
  it('sends the URL of the query, the user agent of the project and the signal', async () => {
    const fetchMock = replying(fixture('yacoubian-title-and-author'));
    const signal = new AbortController().signal;

    await new BnfSruCatalogAdapter({ fetch: fetchMock }).search(yacoubian, signal);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(searchUrl(yacoubian, BASE));
    expect(init?.signal).toBe(signal);
    expect(new Headers(init?.headers).get('user-agent')).toBe(
      'pick-a-book (+https://github.com/arenier/pick-a-book)',
    );
  });

  it('can be pointed elsewhere, and given another user agent', async () => {
    const fetchMock = replying(fixture('fabricated-title-only'));

    await new BnfSruCatalogAdapter({
      fetch: fetchMock,
      baseUrl: 'http://localhost:9/sru',
      userAgent: 'test-agent',
    }).search(yacoubian, new AbortController().signal);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^http:\/\/localhost:9\/sru\?/u);
    expect(new Headers(init?.headers).get('user-agent')).toBe('test-agent');
  });

  it('sends nothing when the query has nothing left to ask', async () => {
    const fetchMock = replying('unused');
    const initials = query({ author: 'J. D.', maxRecords: 20, format: 'full' });

    const page = unwrap(
      await new BnfSruCatalogAdapter({ fetch: fetchMock }).search(
        initials,
        new AbortController().signal,
      ),
    );

    expect(page.records).toStrictEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('BnfSruCatalogAdapter, failures are Err, never thrown (ADR 0013)', () => {
  const search = async (fetchMock: typeof fetch) =>
    new BnfSruCatalogAdapter({ fetch: fetchMock }).search(yacoubian, new AbortController().signal);

  it('returns unavailable when the network fails', async () => {
    const result = await search(async () => {
      throw new TypeError('fetch failed');
    });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'catalog-unavailable', cause: 'unavailable' },
    });
  });

  it.each([500, 502, 503, 429, 408])('returns unavailable on a %s', async (status) => {
    const result = await search(replying('busy', status));

    expect(result).toMatchObject({ ok: false, error: { cause: 'unavailable' } });
  });

  it('returns invalid_response on another error status', async () => {
    const result = await search(replying('no', 404));

    expect(result).toMatchObject({ ok: false, error: { cause: 'invalid_response' } });
  });

  it('returns invalid_response on a body off-contract', async () => {
    const result = await search(replying('<html>maintenance</html>'));

    expect(result).toMatchObject({ ok: false, error: { cause: 'invalid_response' } });
  });

  it('returns unavailable when the request is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = new BnfSruCatalogAdapter({
      fetch: async (_url, init) => {
        init?.signal?.throwIfAborted();
        return new Response('');
      },
    });

    const result = await adapter.search(yacoubian, controller.signal);

    expect(result).toMatchObject({ ok: false, error: { cause: 'unavailable' } });
  });
});
