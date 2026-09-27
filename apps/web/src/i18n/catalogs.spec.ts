import { catalogProblems } from '@pick-a-book/shared-i18n';
import { describe, expect, it } from 'vitest';

import { resources } from './resources';

// ADR 0011: what `i18next-cli status` does not check — plural forms, placeholders.
describe('the catalogs of the front', () => {
  it('agree on plural forms and placeholders', () => {
    expect(catalogProblems(resources)).toStrictEqual([]);
  });
});
