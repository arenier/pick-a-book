import { AuthorityId } from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { BnfAuthorityAdapter } from './bnf-authority.adapter.js';
import { authorityUrl } from './sru-url.js';
import { fixture } from './testing-fixtures.js';

const BASE = 'https://catalogue.bnf.fr/api/SRU';
const signal = () => new AbortController().signal;
const aswani = unwrap(AuthorityId.of('14623756'));

function replying(body: string, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(body, { status }));
}

describe('BnfAuthorityAdapter, the rejected forms', () => {
  it('reads the rejected forms of an author from his authority record', async () => {
    const adapter = new BnfAuthorityAdapter({ fetch: replying(fixture('authority-aswani')) });

    const forms = unwrap(await adapter.rejectedForms(aswani, signal()));

    expect(forms.length).toBeGreaterThan(0);
    expect(forms.some((form) => /Aswany/u.test(form))).toBe(true);
  });

  it('gives no form for an authority that has none', async () => {
    const adapter = new BnfAuthorityAdapter({ fetch: replying(fixture('authority-camus')) });

    const forms = unwrap(await adapter.rejectedForms(unwrap(AuthorityId.of('11894985')), signal()));

    expect(forms).toStrictEqual([]);
  });

  it('asks the URL of the authority, with the user agent of the project', async () => {
    const fetchMock = replying(fixture('authority-aswani'));

    await new BnfAuthorityAdapter({ fetch: fetchMock }).rejectedForms(aswani, signal());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(authorityUrl('14623756', BASE));
    expect(new Headers(init?.headers).get('user-agent')).toContain('pick-a-book');
  });

  it('gives no form for an identifier that is not a number, without a request', async () => {
    const fetchMock = replying('unused');

    const forms = unwrap(
      await new BnfAuthorityAdapter({ fetch: fetchMock }).rejectedForms(
        unwrap(AuthorityId.of('ark:/12148/cb1')),
        signal(),
      ),
    );

    expect(forms).toStrictEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('BnfAuthorityAdapter, the cache', () => {
  it('does not ask twice for the same authority', async () => {
    const fetchMock = replying(fixture('authority-aswani'));
    const adapter = new BnfAuthorityAdapter({ fetch: fetchMock });

    const first = unwrap(await adapter.rejectedForms(aswani, signal()));
    const second = unwrap(await adapter.rejectedForms(aswani, signal()));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(second).toStrictEqual(first);
  });

  it('does not keep a failure: the next call asks again', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(fixture('authority-aswani')));
    const adapter = new BnfAuthorityAdapter({ fetch: fetchMock });

    const failed = await adapter.rejectedForms(aswani, signal());
    const retried = await adapter.rejectedForms(aswani, signal());

    expect(failed.ok).toBe(false);
    expect(retried.ok).toBe(true);
  });
});

describe('BnfAuthorityAdapter, failures are Err (ADR 0013)', () => {
  it('returns unavailable on a server error', async () => {
    const adapter = new BnfAuthorityAdapter({ fetch: replying('busy', 503) });

    await expect(adapter.rejectedForms(aswani, signal())).resolves.toMatchObject({
      ok: false,
      error: { cause: 'unavailable' },
    });
  });

  it('returns invalid_response on a body off-contract', async () => {
    const adapter = new BnfAuthorityAdapter({ fetch: replying('<html/>') });

    await expect(adapter.rejectedForms(aswani, signal())).resolves.toMatchObject({
      ok: false,
      error: { cause: 'invalid_response' },
    });
  });
});
