import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { CatalogQuery } from './catalog-query.js';

describe('CatalogQuery', () => {
  it('accepts a title and an author, trimmed', () => {
    const query = unwrap(
      CatalogQuery.of({
        title: ' La Peste ',
        author: 'Albert Camus',
        maxRecords: 20,
        format: 'full',
      }),
    );

    expect(query.title).toBe('La Peste');
    expect(query.author).toBe('Albert Camus');
  });

  it('accepts an author alone, for the « author only » step', () => {
    expect(CatalogQuery.of({ author: 'Albert Camus', maxRecords: 100, format: 'light' }).ok).toBe(
      true,
    );
  });

  it('accepts a title alone', () => {
    expect(CatalogQuery.of({ title: 'La Peste', maxRecords: 20, format: 'full' }).ok).toBe(true);
  });

  it('refuses a query with neither title nor author', () => {
    expect(CatalogQuery.of({ maxRecords: 20, format: 'full' }).ok).toBe(false);
    expect(CatalogQuery.of({ title: '  ', author: '', maxRecords: 20, format: 'full' }).ok).toBe(
      false,
    );
  });

  it.each([0, 101, 1.5, Number.NaN])('refuses %s records', (maxRecords) => {
    expect(CatalogQuery.of({ title: 'La Peste', maxRecords, format: 'full' }).ok).toBe(false);
  });

  it('keeps 1 and 100 as the bounds', () => {
    expect(CatalogQuery.of({ title: 'La Peste', maxRecords: 1, format: 'full' }).ok).toBe(true);
    expect(CatalogQuery.of({ title: 'La Peste', maxRecords: 100, format: 'full' }).ok).toBe(true);
  });
});
