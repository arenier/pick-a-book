import { describe, expect, it } from 'vitest';

import { CatalogName } from './catalog-name.js';

describe('CatalogName', () => {
  it.each(['bnf', 'stub', 'offline', 'open-library-2'])('accepts %s', (raw) => {
    expect(CatalogName.of(raw).ok).toBe(true);
  });

  it.each(['', 'BnF', 'a b', 'bnf!'])('rejects "%s"', (raw) => {
    expect(CatalogName.of(raw).ok).toBe(false);
  });
});
