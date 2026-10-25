import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { parseSruPage } from './sru-response.js';
import { fixture } from './testing-fixtures.js';

const unimarc = (name: string) => unwrap(parseSruPage(fixture(name), 'unimarc'));
const dublinCore = (name: string) => unwrap(parseSruPage(fixture(name), 'dublin-core'));

describe('parseSruPage, a UNIMARC page', () => {
  const yacoubian = unimarc('yacoubian-title-and-author');

  it('reads every record of the page, in the order of the answer', () => {
    expect(yacoubian.map((record) => record.id.value)).toStrictEqual([
      'ark:/12148/cb40226583k',
      'ark:/12148/cb442235048',
      'ark:/12148/cb401096908',
      'ark:/12148/cb41123592s',
    ]);
  });

  it('reads the title, the complement and the authors with their role and authority', () => {
    const [plain, withComplement] = yacoubian;

    expect(plain.title).toBe("L'immeuble Yacoubian");
    expect(plain.titleComplement).toBeUndefined();
    expect(withComplement.titleComplement).toBe('roman');
    expect(
      plain.authors.map((author) => [author.name, author.role, author.authorityId?.value]),
    ).toStrictEqual([
      ['Aswānī, ʿAlāʾ al-', 'main', '14623756'],
      ['Gauthier, Gilles', 'secondary', '15049935'],
    ]);
  });

  it('reads the collection and the publisher', () => {
    const [, babel] = yacoubian;

    expect(babel.context.collection).toBe('Babel');
    expect(babel.context.publisher).toBeDefined();
  });

  it('keeps the record as received, and its format', () => {
    const [first] = yacoubian;

    expect(first.format).toBe('unimarc');
    expect(first.raw).toMatch(/^<mxc:record [^>]*id="ark:\/12148\/cb40226583k"/u);
    expect(first.raw).toMatch(/<\/mxc:record>$/u);
  });

  it('reads an empty page as no record', () => {
    expect(unimarc('fabricated-title-and-author')).toStrictEqual([]);
  });
});

describe('parseSruPage, the series and the volume', () => {
  const percy = unimarc('percy-title-segment');

  it('reads the series and the volume of the series link', () => {
    const volumeTwo = percy.find((record) => record.id.value === 'ark:/12148/cb43475858r');

    expect(volumeTwo?.context).toMatchObject({
      series: 'Percy Jackson',
      volume: 2,
      collection: 'Wiz',
    });
  });

  it('reads the volume of the title when there is no link: « tome 2 »', () => {
    const titled = percy.find((record) => record.id.value === 'ark:/12148/cb48697059t');

    expect(titled?.context.volume).toBe(2);
  });

  it('puts the co-authors of the main responsibility among the main authors', () => {
    const authors = unimarc('eternels-title-and-author').flatMap((record) => record.authors);

    expect(authors.some((author) => author.role === 'main')).toBe(true);
    expect(authors.some((author) => author.role === 'secondary')).toBe(true);
  });

  it('does not take the number of a publisher collection for a volume', () => {
    const livreDePoche = unimarc('lunes-17-title-and-author').find(
      (record) => record.id.value === 'ark:/12148/cb43809548t',
    );

    expect(livreDePoche?.context.volume).toBeUndefined();
  });
});

describe('parseSruPage, what the real catalogue does', () => {
  // Some records carry an author field with an authority number and no name: it names nobody.
  it('skips an author field that holds no name, instead of refusing the page', () => {
    const page = unimarc('peste-title-only');

    expect(page.length).toBeGreaterThan(0);
    expect(page.flatMap((record) => record.authors).every((author) => author.name !== '')).toBe(
      true,
    );
  });
});

describe('parseSruPage, a Dublin Core page', () => {
  const queneau = dublinCore('queneau-author-only');

  const leBon = queneau.find((record) => record.title === 'Gustave Le Bon');

  it('reads the title before its statement of responsibility', () => {
    expect(leBon?.title).toBe('Gustave Le Bon');
  });

  it('reads the creator as the main author and the contributor as a secondary one, without roles', () => {
    expect(leBon?.authors.map((author) => [author.name, author.role])).toStrictEqual([
      ['Queneau, Raymond (1903-1976)', 'main'],
      ['Debon, Claude (1937-....)', 'secondary'],
      [
        "Centre international de documentation, de recherche et d'édition Raymond Queneau",
        'secondary',
      ],
    ]);
  });

  it('keeps the name when a contributor has two roles', () => {
    const engraver = queneau.find((record) => record.title === '9 septembre 1969');

    expect(engraver?.authors.map((author) => author.name)).toStrictEqual([
      'Queneau, Raymond (1903-1976)',
      'Queneau, Jean-Marie (1934-2022)',
    ]);
  });

  it('reads the ark from the identifier, and keeps the record and its format', () => {
    const [first] = queneau;

    expect(first.id.value).toMatch(/^ark:\/12148\/cb\w+$/u);
    expect(first.format).toBe('dublin-core');
    expect(first.raw).toMatch(/^<oai_dc:dc /u);
    expect(first.authors.every((author) => author.authorityId === undefined)).toBe(true);
  });

  it('reads an empty page as no record', () => {
    expect(dublinCore('delcourt-author-only')).toStrictEqual([]);
  });
});

describe('parseSruPage, an answer off-contract is refused whole', () => {
  it.each([
    ['not XML at all', 'oops'],
    ['XML of another shape', '<html><body>maintenance</body></html>'],
    [
      'an SRU diagnostic',
      fixture('fabricated-title-and-author').replace(
        '</srw:searchRetrieveResponse>',
        '<srw:diagnostics><x/></srw:diagnostics></srw:searchRetrieveResponse>',
      ),
    ],
  ])('refuses %s', (_name, xml) => {
    expect(parseSruPage(xml, 'unimarc')).toMatchObject({ ok: false });
  });

  it('refuses a page of which one record has no identifier, and keeps none of the others', () => {
    const xml = fixture('yacoubian-title-and-author').replace('id="ark:/12148/cb442235048"', '');

    expect(parseSruPage(xml, 'unimarc')).toMatchObject({ ok: false });
  });

  it('refuses a page of which one record has no title', () => {
    const xml = fixture('yacoubian-title-and-author').replace(
      /<mxc:datafield tag="200"[\s\S]*?<\/mxc:datafield>/u,
      '',
    );

    expect(parseSruPage(xml, 'unimarc')).toMatchObject({ ok: false });
  });

  it('refuses a UNIMARC page read as Dublin Core', () => {
    expect(parseSruPage(fixture('yacoubian-title-and-author'), 'dublin-core')).toMatchObject({
      ok: false,
    });
  });
});
