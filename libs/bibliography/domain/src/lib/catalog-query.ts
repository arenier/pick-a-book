import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';

/**
 * `full` is the whole record (UNIMARC for the BnF); `light` is the short one (Dublin Core), for
 * the « author only » step that asks for a hundred records (research §6).
 */
export type CatalogQueryFormat = 'full' | 'light';

export interface CatalogQueryInput {
  readonly title?: string;
  readonly author?: string;
  readonly maxRecords: number;
  readonly format: CatalogQueryFormat;
}

const MAX_RECORDS = 100;

/**
 * One request to the catalogue. The adapter runs exactly one: the cascade of queries is the
 * application's, and so is the decision to stop (ADR 0014).
 */
export class CatalogQuery {
  private constructor(
    readonly title: string | undefined,
    readonly author: string | undefined,
    readonly maxRecords: number,
    readonly format: CatalogQueryFormat,
  ) {}

  static of(input: CatalogQueryInput): Result<CatalogQuery, InvalidValue> {
    const title = presentOrUndefined(input.title);
    const author = presentOrUndefined(input.author);

    if (title === undefined && author === undefined) {
      return err(new InvalidValue('CatalogQuery: at least one of title and author is required'));
    }
    if (
      !Number.isInteger(input.maxRecords) ||
      input.maxRecords < 1 ||
      input.maxRecords > MAX_RECORDS
    ) {
      return err(
        new InvalidValue(
          `CatalogQuery: maxRecords must be an integer in [1, ${MAX_RECORDS}] (${input.maxRecords})`,
        ),
      );
    }

    return ok(new CatalogQuery(title, author, input.maxRecords, input.format));
  }
}

function presentOrUndefined(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replaceAll(/\s+/gu, ' ');

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}
