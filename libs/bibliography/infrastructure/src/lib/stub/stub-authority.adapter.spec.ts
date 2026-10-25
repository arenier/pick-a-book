import { AuthorityId } from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { StubAuthorityAdapter } from './stub-authority.adapter.js';

const signal = new AbortController().signal;

describe('StubAuthorityAdapter', () => {
  it('gives a rejected form for the author of the stub catalogue who has one', async () => {
    const forms = unwrap(
      await new StubAuthorityAdapter().rejectedForms(unwrap(AuthorityId.of('stub-duras')), signal),
    );

    expect(forms).toStrictEqual(['Duras, Marguerite']);
  });

  it('gives none for another authority', async () => {
    const forms = unwrap(
      await new StubAuthorityAdapter().rejectedForms(unwrap(AuthorityId.of('stub-other')), signal),
    );

    expect(forms).toStrictEqual([]);
  });
});
