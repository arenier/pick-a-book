import { err, ok, type Result } from '@pick-a-book/shared-result';

import { AuthorityId } from './authority-id.js';
import { CatalogRecordId } from './catalog-record-id.js';
import { InvalidValue } from './invalid-value.error.js';

export type RecordAuthorRole = 'main' | 'secondary';

export type RecordFormat = 'unimarc' | 'dublin-core';

/** An author as the record gives it: the name in the catalogue's own form, its role, its authority. */
export interface RecordAuthor {
  readonly name: string;
  readonly role: RecordAuthorRole;
  /** The authority record of this author, when the record points to one (research §5.4). */
  readonly authorityId: AuthorityId | undefined;
}

/** What the record says around its title: enough to explain a segment that was read (§5.5). */
export interface RecordContext {
  readonly series: string | undefined;
  readonly volume: number | undefined;
  readonly collection: string | undefined;
  readonly publisher: string | undefined;
}

export interface CatalogRecordInput {
  readonly id: string;
  readonly title: string;
  readonly titleComplement?: string;
  readonly authors: readonly {
    readonly name: string;
    readonly role: RecordAuthorRole;
    readonly authorityId?: string;
  }[];
  readonly context?: {
    readonly series?: string;
    readonly volume?: number;
    readonly collection?: string;
    readonly publisher?: string;
  };
  /** The record as received, kept for later enrichment and never read by the domain. */
  readonly raw: string;
  readonly format: RecordFormat;
}

/** A record of the catalogue, read in full (research §5.2). */
export class CatalogRecord {
  private constructor(
    readonly id: CatalogRecordId,
    readonly title: string,
    readonly titleComplement: string | undefined,
    readonly authors: readonly RecordAuthor[],
    readonly context: RecordContext,
    readonly raw: string,
    readonly format: RecordFormat,
  ) {}

  static of(input: CatalogRecordInput): Result<CatalogRecord, InvalidValue> {
    const id = CatalogRecordId.of(input.id);
    if (!id.ok) {
      return id;
    }
    const title = input.title.trim();
    if (title.length === 0) {
      return err(new InvalidValue('CatalogRecord: the title cannot be empty'));
    }

    const authors: RecordAuthor[] = [];
    for (const author of input.authors) {
      const name = author.name.trim();
      if (name.length === 0) {
        return err(new InvalidValue('CatalogRecord: an author needs a name'));
      }
      let authorityId: AuthorityId | undefined;
      if (author.authorityId !== undefined) {
        const parsed = AuthorityId.of(author.authorityId);
        if (!parsed.ok) {
          return parsed;
        }
        authorityId = parsed.value;
      }
      authors.push({ name, role: author.role, authorityId });
    }

    const volume = input.context?.volume;
    if (volume !== undefined && (!Number.isInteger(volume) || volume < 0)) {
      return err(new InvalidValue(`CatalogRecord: the volume must be an integer >= 0 (${volume})`));
    }

    return ok(
      new CatalogRecord(
        id.value,
        title,
        presentOrUndefined(input.titleComplement),
        authors,
        {
          series: presentOrUndefined(input.context?.series),
          volume,
          collection: presentOrUndefined(input.context?.collection),
          publisher: presentOrUndefined(input.context?.publisher),
        },
        input.raw,
        input.format,
      ),
    );
  }
}

function presentOrUndefined(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}
