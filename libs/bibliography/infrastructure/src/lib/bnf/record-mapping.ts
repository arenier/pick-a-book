import type { CatalogRecordInput } from '@pick-a-book/bibliography-domain';

import type { DublinCoreRecord, MarcDatafield, MarcRecord } from './sru-response.js';

type Authors = CatalogRecordInput['authors'];
type Context = NonNullable<CatalogRecordInput['context']>;

/** UNIMARC tags of the authors: the main responsibilities, then the secondary ones. */
const MAIN_AUTHOR_TAGS = ['700', '701', '710', '711'];
const SECONDARY_AUTHOR_TAGS = ['702', '712'];

const ROMAN: Readonly<Record<string, number>> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
};

/**
 * A UNIMARC record of the BnF as the domain describes it (research §5.2): the title of the
 * 200 field, the authors of the 70x/71x fields with their authority numbers, and what surrounds
 * the title — the series and its volume (461), the collection (225), the publisher (210).
 */
export function unimarcToInput(record: MarcRecord, raw: string): CatalogRecordInput {
  const titleField = firstField(record, '200');
  const series = firstText(fieldsOf(record, '461'), 't');

  return {
    id: record['@_id'],
    title: texts(titleField, 'a').join(' ; '),
    titleComplement: optionalJoin(texts(titleField, 'e'), ' : '),
    authors: [
      ...authorsOf(record, MAIN_AUTHOR_TAGS, 'main'),
      ...authorsOf(record, SECONDARY_AUTHOR_TAGS, 'secondary'),
    ],
    context: contextOf(record, series),
    raw,
    format: 'unimarc',
  };
}

/**
 * A Dublin Core record of the BnF: the light form of the « author only » step. It has a title,
 * its creators and contributors, a publisher — no authority, no series, no volume.
 */
export function dublinCoreToInput(
  record: DublinCoreRecord,
  raw: string,
): CatalogRecordInput | undefined {
  const ark = /\/(ark:\/12148\/[\w]+)$/u.exec(record.identifier[0])?.[1];
  if (ark === undefined) {
    return undefined;
  }

  return {
    id: ark,
    title: record.title[0].split(' / ')[0],
    authors: [
      ...record.creator.map((name) => ({ name: dublinCoreName(name), role: 'main' as const })),
      ...record.contributor.map((name) => ({
        name: dublinCoreName(name),
        role: 'secondary' as const,
      })),
    ],
    context: { publisher: [record.publisher ?? []].flat().at(0) },
    raw,
    format: 'dublin-core',
  };
}

/** « Camus, Albert (1913-1960). Auteur du texte / Autrice du texte » is « Camus, Albert (1913-1960) ». */
function dublinCoreName(creator: string): string {
  // The dates close the name when there are some; « (1989-....) » holds dots of its own.
  const afterDates = /^(.*?\))\.\s/u.exec(creator);
  if (afterDates !== null) {
    return afterDates[1].trim();
  }
  const roleStart = creator.indexOf('. ');

  return (roleStart < 0 ? creator : creator.slice(0, roleStart)).trim();
}

function authorsOf(
  record: MarcRecord,
  tags: readonly string[],
  role: 'main' | 'secondary',
): Authors {
  // A field with no name in it (an authority number alone) names nobody: it is skipped.
  return record.datafield
    .filter((field) => tags.includes(field['@_tag']) && texts(field, 'a').length > 0)
    .map((field) => {
      const family = texts(field, 'a').join(' ');
      const given = texts(field, 'b').join(' ');
      const authorityId = firstText([field], '3');

      return { name: given === '' ? family : `${family}, ${given}`, role, authorityId };
    });
}

function contextOf(record: MarcRecord, series: string | undefined): Context {
  const seriesLink = fieldsOf(record, '461');
  const titleField = firstField(record, '200');
  const collection = fieldsOf(record, '225')
    .flatMap((field) => texts(field, 'a'))
    .find((name) => name !== series);

  return {
    series,
    volume: volumeOf(
      firstText(seriesLink, 'v') ?? firstText(titleField === undefined ? [] : [titleField], 'h'),
    ),
    collection,
    publisher: firstText(fieldsOf(record, '210'), 'c'),
  };
}

/** « 2 », « tome 2 », « Tome 1 », « IV » are volumes; « 33339 » of a publisher's collection is not read here. */
function volumeOf(text: string | undefined): number | undefined {
  if (text === undefined) {
    return undefined;
  }
  const digits = /\d{1,3}/u.exec(text)?.[0];
  if (digits !== undefined) {
    return Number(digits);
  }

  return ROMAN[
    text
      .trim()
      .replace(/^tome\s+/iu, '')
      .toUpperCase()
  ];
}

function fieldsOf(record: MarcRecord, tag: string): readonly MarcDatafield[] {
  return record.datafield.filter((field) => field['@_tag'] === tag);
}

function firstField(record: MarcRecord, tag: string): MarcDatafield | undefined {
  return fieldsOf(record, tag).at(0);
}

function texts(field: MarcDatafield | undefined, code: string): readonly string[] {
  return (field?.subfield ?? [])
    .filter((sub) => sub['@_code'] === code)
    .map((sub) => (sub['#text'] ?? '').trim())
    .filter((text) => text.length > 0);
}

function firstText(fields: readonly MarcDatafield[], code: string): string | undefined {
  return fields.flatMap((field) => texts(field, code)).at(0);
}

function optionalJoin(parts: readonly string[], separator: string): string | undefined {
  return parts.length === 0 ? undefined : parts.join(separator);
}

/** The rejected forms of an authority: « Aswany, Alaa el- » from a 400, a name from a 410. */
export function authorityFormsOf(record: MarcRecord): readonly string[] {
  return record.datafield
    .filter((field) => field['@_tag'] === '400' || field['@_tag'] === '410')
    .map((field) => {
      const family = texts(field, 'a').join(' ');
      const given = texts(field, 'b').join(' ');

      return given === '' ? family : `${family}, ${given}`;
    })
    .filter((form) => form.length > 0);
}
