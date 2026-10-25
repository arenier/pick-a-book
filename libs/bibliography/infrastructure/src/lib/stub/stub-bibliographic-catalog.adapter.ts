import {
  CatalogName,
  CatalogRecord,
  type BibliographicCatalogPort,
  type CatalogPage,
  type CatalogQuery,
  type CatalogRecordInput,
  type CatalogUnavailable,
} from '@pick-a-book/bibliography-domain';
import { ok, unwrap, type Result } from '@pick-a-book/shared-result';
import { normalizeText } from '@pick-a-book/shared-text-match';

/**
 * The books of the stub scanner, as a catalogue would describe them (specs/003, research §12):
 * L'Amant in two editions, whose author is written « Donnadieu » (the authority knows her as
 * « Duras »), Les Choses, and two works called La Place, of which the scanner reads Ernaux's.
 */
const RECORDS: readonly CatalogRecordInput[] = [
  stubRecord(
    'amant-minuit',
    "L'Amant",
    'Donnadieu, Marguerite',
    { publisher: 'Éditions de Minuit' },
    'stub-duras',
  ),
  stubRecord(
    'amant-folio',
    "L'Amant",
    'Donnadieu, Marguerite',
    { collection: 'Folio' },
    'stub-duras',
  ),
  stubRecord('les-choses', 'Les choses', 'Perec, Georges'),
  stubRecord('la-place-ernaux', 'La place', 'Ernaux, Annie'),
  stubRecord('la-place-autre', 'La place', 'Dupont, Camille'),
];

function stubRecord(
  id: string,
  title: string,
  author: string,
  context: NonNullable<CatalogRecordInput['context']> = {},
  authorityId?: string,
): CatalogRecordInput {
  return {
    id: `ark:/stub/${id}`,
    title,
    authors: [
      { name: author, role: 'main', ...(authorityId === undefined ? {} : { authorityId }) },
    ],
    context,
    raw: `<stub id="${id}"/>`,
    format: 'unimarc',
  };
}

/**
 * A catalogue in memory, for developing and for the specs without network or key. With
 * `matchBook`, it confirms the books of the stub scanner and knows nothing of what looks like
 * « Titre peu lisible ».
 */
export class StubBibliographicCatalogAdapter implements BibliographicCatalogPort {
  readonly name = unwrap(CatalogName.of('stub'));
  private readonly records = RECORDS.map((input) => unwrap(CatalogRecord.of(input)));

  async search(
    query: CatalogQuery,
    _signal: AbortSignal,
  ): Promise<Result<CatalogPage, CatalogUnavailable>> {
    const found = this.records.filter(
      (record) =>
        containsWords(record.title, query.title) &&
        (query.author === undefined ||
          record.authors.some((author) => containsWords(author.name, query.author))),
    );

    return ok({ records: found.slice(0, query.maxRecords) });
  }
}

/** Every word of `wanted`, normalised, is among the words of `text`; no `wanted` is a yes. */
function containsWords(text: string, wanted: string | undefined): boolean {
  if (wanted === undefined) {
    return true;
  }
  const words = new Set(normalizeText(text).split(' '));

  return normalizeText(wanted)
    .split(' ')
    .every((word) => words.has(word));
}
