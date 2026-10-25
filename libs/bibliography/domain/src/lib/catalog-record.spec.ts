import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { CatalogRecord, type CatalogRecordInput } from './catalog-record.js';

const input = {
  id: 'ark:/12148/cb11111111x',
  title: 'La peste',
  authors: [
    { name: 'Camus, Albert', role: 'main', authorityId: 'ark:/12148/cb11888456h' },
    { name: 'Illustrateur, Un', role: 'secondary' },
  ],
  context: { series: 'Folio', volume: 3 },
  raw: '<record/>',
  format: 'unimarc',
} satisfies CatalogRecordInput;

describe('CatalogRecord, read as the catalogue describes it', () => {
  const record = unwrap(CatalogRecord.of(input));

  it('keeps the identifier, the title and what was received', () => {
    expect(record.id.value).toBe('ark:/12148/cb11111111x');
    expect(record.title).toBe('La peste');
    expect(record.titleComplement).toBeUndefined();
    expect(record.raw).toBe('<record/>');
    expect(record.format).toBe('unimarc');
  });

  it('keeps every author with its role and its authority', () => {
    expect(record.authors.map((author) => author.name)).toStrictEqual([
      'Camus, Albert',
      'Illustrateur, Un',
    ]);
    expect(record.authors.map((author) => author.role)).toStrictEqual(['main', 'secondary']);
    expect(record.authors.map((author) => author.authorityId?.value)).toStrictEqual([
      'ark:/12148/cb11888456h',
      undefined,
    ]);
  });

  it('keeps the context, with what is missing left undefined', () => {
    expect(record.context).toStrictEqual({
      series: 'Folio',
      volume: 3,
      collection: undefined,
      publisher: undefined,
    });
  });

  it('accepts a record without author nor context', () => {
    const bare = unwrap(CatalogRecord.of({ ...input, authors: [], context: undefined }));

    expect(bare.authors).toStrictEqual([]);
  });
});

describe('CatalogRecord, refused', () => {
  it('refuses an empty title', () => {
    expect(CatalogRecord.of({ ...input, title: '  ' }).ok).toBe(false);
  });

  it('refuses an empty identifier', () => {
    expect(CatalogRecord.of({ ...input, id: '' }).ok).toBe(false);
  });

  it('refuses an author without a name', () => {
    expect(CatalogRecord.of({ ...input, authors: [{ name: ' ', role: 'main' }] }).ok).toBe(false);
  });

  it('refuses an invalid authority identifier', () => {
    const authors = [{ name: 'Camus', role: 'main', authorityId: '' }] as const;

    expect(CatalogRecord.of({ ...input, authors }).ok).toBe(false);
  });

  it.each([-1, 1.5])('refuses the volume %s', (volume) => {
    expect(CatalogRecord.of({ ...input, context: { volume } }).ok).toBe(false);
  });
});
