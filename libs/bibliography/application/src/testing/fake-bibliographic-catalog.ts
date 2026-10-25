import {
  CatalogName,
  CatalogUnavailable,
  type BibliographicCatalogPort,
  type CatalogPage,
  type CatalogQuery,
  type CatalogRecord,
} from '@pick-a-book/bibliography-domain';
import { err, ok, unwrap, type Result } from '@pick-a-book/shared-result';

/** What the fake answers: records, or the reason the catalogue could not. */
export type CatalogReply = readonly CatalogRecord[] | CatalogUnavailable;

interface Rule {
  readonly when: (query: CatalogQuery) => boolean;
  readonly reply: CatalogReply;
  readonly delayMs: number;
}

/**
 * A catalogue the specs script: the first rule whose predicate matches the query answers, after
 * its delay; no rule matching means an empty page. Every query is kept, so a spec can count the
 * calls it provoked. It stands where the adapter would: the `Err` of the port is returned.
 */
export class FakeBibliographicCatalog implements BibliographicCatalogPort {
  readonly name = unwrap(CatalogName.of('stub'));
  readonly queries: CatalogQuery[] = [];
  private readonly rules: Rule[] = [];

  /** Answers the queries `when` accepts, after `delayMs` (0 by default). */
  on(when: (query: CatalogQuery) => boolean, reply: CatalogReply, delayMs = 0): this {
    this.rules.push({ when, reply, delayMs });

    return this;
  }

  /** Answers every query with the same reply. */
  always(reply: CatalogReply, delayMs = 0): this {
    return this.on(() => true, reply, delayMs);
  }

  callsWhere(when: (query: CatalogQuery) => boolean): number {
    return this.queries.filter(when).length;
  }

  async search(
    query: CatalogQuery,
    signal: AbortSignal,
  ): Promise<Result<CatalogPage, CatalogUnavailable>> {
    this.queries.push(query);
    const rule = this.rules.find((candidate) => candidate.when(query));
    if (rule === undefined) {
      return ok({ records: [] });
    }
    if (rule.delayMs > 0 && !(await waitOrAbort(rule.delayMs, signal))) {
      return err(new CatalogUnavailable('unavailable'));
    }

    return rule.reply instanceof CatalogUnavailable ? err(rule.reply) : ok({ records: rule.reply });
  }
}

/** Resolves true after the delay, or false as soon as the signal aborts. */
async function waitOrAbort(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    return false;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const elapsed = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      resolve(true);
    }, delayMs);
  });
  const aborted = new Promise<boolean>((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        resolve(false);
      },
      { once: true },
    );
  });

  try {
    return await Promise.race([elapsed, aborted]);
  } finally {
    clearTimeout(timer);
  }
}
