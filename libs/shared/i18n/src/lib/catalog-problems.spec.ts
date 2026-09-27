import { describe, expect, it } from 'vitest';

import { catalogProblems } from './catalog-problems';

// What `i18next-cli status` does not check (ADR 0011): plural forms against the CLDR rules of each
// language, and placeholders kept identical from French to its translations.
describe('catalogProblems, on plural forms', () => {
  it('finds nothing in catalogs that agree', () => {
    expect(
      catalogProblems({
        fr: {
          shelf: {
            count_one: '{{count}} livre',
            count_many: '{{count}} de livres',
            count_other: '{{count}} livres',
          },
        },
        en: { shelf: { count_one: '{{count}} book', count_other: '{{count}} books' } },
      }),
    ).toStrictEqual([]);
  });

  // French puts exact millions under `many`: without that form, i18next shows the raw key.
  it('reports a French plural without its many form', () => {
    expect(
      catalogProblems({
        fr: { shelf: { count_one: '{{count}} livre', count_other: '{{count}} livres' } },
        en: { shelf: { count_one: '{{count}} book', count_other: '{{count}} books' } },
      }),
    ).toStrictEqual(['fr/shelf: "count" lacks the plural form "many"']);
  });

  it('reports a plural form the language does not have', () => {
    expect(
      catalogProblems({
        fr: {
          shelf: {
            count_one: '{{count}} livre',
            count_many: '{{count}} de livres',
            count_other: '{{count}} livres',
          },
        },
        en: {
          shelf: {
            count_one: '{{count}} book',
            count_many: '{{count}} books',
            count_other: '{{count}} books',
          },
        },
      }),
    ).toStrictEqual(['en/shelf: "count" has the plural form "many", unknown to en']);
  });
});

describe('catalogProblems, on placeholders', () => {
  it('reports a placeholder a translation renames', () => {
    expect(
      catalogProblems({
        fr: { upload: { failure: { type: 'Format {{format}} refusé' } } },
        en: { upload: { failure: { type: 'Unsupported format: {{fromat}}' } } },
      }),
    ).toStrictEqual(['en/upload: "failure.type" uses {{fromat}} where French uses {{format}}']);
  });

  it('reads a placeholder that carries a format', () => {
    expect(
      catalogProblems({
        fr: { shelf: { size: '{{size, number}} Mo' } },
        en: { shelf: { size: '{{size, number}} MB' } },
      }),
    ).toStrictEqual([]);
  });

  it('leaves a key missing from a translation to i18next-cli status', () => {
    expect(
      catalogProblems({
        fr: { shelf: { title: 'Étagère', size: '{{size}} Mo' } },
        en: { shelf: { title: 'Shelf' } },
      }),
    ).toStrictEqual([]);
  });
});
