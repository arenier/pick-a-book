import { CatalogRecord, type CatalogRecordInput } from '@pick-a-book/bibliography-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

import { authorityFormsOf, dublinCoreToInput, unimarcToInput } from './record-mapping.js';

/** The answer could not be proven to be what the contract says (`adapters.md`: all or nothing). */
export class InvalidSruResponse extends Error {
  readonly kind = 'invalid-sru-response';
}

export type SruFormat = 'unimarc' | 'dublin-core';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  removeNSPrefix: true,
  // Every value stays a string: an ARK, a volume or a title is never a number to the parser.
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) =>
    ['record', 'datafield', 'subfield', 'identifier', 'title', 'creator', 'contributor'].includes(
      name,
    ),
});

/** The fields of the answer the adapter relies on, and no more (`adapters.md`: a narrow schema). */
const subfield = z.object({ '@_code': z.string(), '#text': z.string().optional() });
const datafield = z.object({ '@_tag': z.string(), subfield: z.array(subfield).default([]) });
const marcRecord = z.object({ '@_id': z.string(), datafield: z.array(datafield).default([]) });
/** A Dublin Core value is a string, or a string carrying an attribute (`xml:lang`). */
const dcText = z
  .union([z.string(), z.object({ '#text': z.string() })])
  .transform((value) => (typeof value === 'string' ? value : value['#text']));
const dublinCore = z.object({
  identifier: z.array(dcText).min(1),
  title: z.array(dcText).min(1),
  creator: z.array(dcText).default([]),
  contributor: z.array(dcText).default([]),
  publisher: z.union([dcText, z.array(dcText)]).optional(),
});

function envelope<T extends z.ZodType>(data: T) {
  return z.object({
    searchRetrieveResponse: z.object({
      numberOfRecords: z.string(),
      diagnostics: z.never().optional(),
      // An empty page comes as an empty element, which the parser reads as an empty string.
      records: z
        .union([z.literal(''), z.object({ record: z.array(z.object({ recordData: data })) })])
        .optional(),
    }),
  });
}

const unimarcEnvelope = envelope(z.object({ record: z.array(marcRecord).length(1) }));
const dublinCoreEnvelope = envelope(z.object({ dc: dublinCore }));

export type MarcDatafield = z.infer<typeof datafield>;
export type MarcRecord = z.infer<typeof marcRecord>;
export type DublinCoreRecord = z.infer<typeof dublinCore>;

/**
 * The records of an SRU page, as the domain describes them. A page whose shape or whose records
 * do not hold is refused whole: keeping the valid part would hand back a page silently shorter
 * than the BnF's, and a book that is « not found » for it.
 */
export function parseSruPage(
  xml: string,
  format: SruFormat,
): Result<readonly CatalogRecord[], InvalidSruResponse> {
  const parsed = parseXml(xml);
  if (parsed === undefined) {
    return err(new InvalidSruResponse('not XML'));
  }

  const result = format === 'unimarc' ? unimarcInputs(parsed, xml) : dublinCoreInputs(parsed, xml);
  if (!result.ok) {
    return err(new InvalidSruResponse(`not an SRU answer in ${format}: ${result.error}`));
  }
  const inputs = result.value;

  const records: CatalogRecord[] = [];
  for (const input of inputs) {
    const record = CatalogRecord.of(input);
    if (!record.ok) {
      return err(new InvalidSruResponse(record.error.message));
    }
    records.push(record.value);
  }

  return ok(records);
}

function parseXml(xml: string): unknown {
  try {
    return parser.parse(xml);
  } catch {
    return undefined;
  }
}

function unimarcInputs(
  parsed: unknown,
  xml: string,
): Result<readonly CatalogRecordInput[], string> {
  const page = unimarcEnvelope.safeParse(parsed);
  if (!page.success) {
    return err(page.error.message);
  }
  const records = entriesOf(page.data.searchRetrieveResponse.records);
  const raws = rawRecords(xml, /<mxc:record\b[\s\S]*?<\/mxc:record>/gu);
  if (raws.length !== records.length) {
    return err(`${records.length} records parsed, ${raws.length} found`);
  }

  return ok(records.map((entry, index) => unimarcToInput(entry.recordData.record[0], raws[index])));
}

function dublinCoreInputs(
  parsed: unknown,
  xml: string,
): Result<readonly CatalogRecordInput[], string> {
  const page = dublinCoreEnvelope.safeParse(parsed);
  if (!page.success) {
    return err(page.error.message);
  }
  const records = entriesOf(page.data.searchRetrieveResponse.records);
  const raws = rawRecords(xml, /<oai_dc:dc\b[\s\S]*?<\/oai_dc:dc>/gu);
  if (raws.length !== records.length) {
    return err(`${records.length} records parsed, ${raws.length} found`);
  }

  const inputs: CatalogRecordInput[] = [];
  for (const [index, entry] of records.entries()) {
    const input = dublinCoreToInput(entry.recordData.dc, raws[index]);
    if (input === undefined) {
      return err('a record without an ark');
    }
    inputs.push(input);
  }

  return ok(inputs);
}

function entriesOf<T>(records: '' | { readonly record: readonly T[] } | undefined): readonly T[] {
  return records === undefined || records === '' ? [] : records.record;
}

/** The text of each record as it was received: kept for the enrichment that comes later. */
function rawRecords(xml: string, pattern: RegExp): readonly string[] {
  return [...xml.matchAll(pattern)].map((match) => match[0]);
}

/**
 * The rejected forms of an authority record: the 400 (person) and 410 (organisation) fields.
 * An authority the BnF does not know is an empty page, hence no form.
 */
export function parseAuthorityForms(xml: string): Result<readonly string[], InvalidSruResponse> {
  const parsed = parseXml(xml);
  const page = unimarcEnvelope.safeParse(parsed);
  if (parsed === undefined || !page.success) {
    return err(new InvalidSruResponse('not an SRU answer for an authority'));
  }

  return ok(
    entriesOf(page.data.searchRetrieveResponse.records).flatMap((entry) =>
      authorityFormsOf(entry.recordData.record[0]),
    ),
  );
}
