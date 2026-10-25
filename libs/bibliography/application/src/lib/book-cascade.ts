import {
  CatalogQuery,
  matchBook,
  reconciliationScore,
  type AttemptResult,
  type AuthorityCheck,
  type AuthorityPort,
  type BibliographicCatalogPort,
  type CascadeStep,
  type CatalogPage,
  type CatalogQueryInput,
  type MatchingSettings,
  type MatchOutcome,
  type NotVerifiedCause,
  type ReadBook,
} from '@pick-a-book/bibliography-domain';

import { type RequestRunner, type RunOutcome } from './run-with-limits.js';

/** Records asked for by a title query, and by the « author only » one (research §5, §6). */
const TITLE_RECORDS = 20;
const AUTHOR_RECORDS = 100;

interface Step {
  readonly step: CascadeStep;
  readonly queries: readonly CatalogQueryInput[];
}

/**
 * The cascade of queries for one book (ADR 0014, research §5): title and author, the author
 * alone, the title alone, then each segment of a composed title. It stops at the first step that
 * gives a verdict — `confirmed` or `ambiguous` — and leaves the verdict itself to the domain.
 *
 * A request that stays in failure (after its retry) or out of time makes the whole book « not
 * verified », never « not found »: the step that was missed could have been the one that finds.
 * A failing authority is not such a case — the record is simply discarded, as before the ADR.
 */
export class BookCascade {
  /** The rejected forms asked for, by authority: one request per authority in a reconciliation. */
  private readonly rejectedForms = new Map<string, Promise<readonly string[] | undefined>>();

  constructor(
    private readonly catalog: BibliographicCatalogPort,
    private readonly authorities: AuthorityPort,
    private readonly settings: MatchingSettings,
    private readonly runner: RequestRunner,
  ) {}

  async reconcile(read: ReadBook): Promise<AttemptResult> {
    if (this.runner.spent) {
      return { kind: 'not_verified', cause: 'timeout' };
    }

    // One query after the other, until one gives a verdict or fails: each waits for the previous.
    const queries = stepsOf(read).flatMap(({ step, queries: inputs }) =>
      inputs.map((input) => ({ step, input })),
    );
    const concluded = await queries.reduce<Promise<AttemptResult | null>>(
      async (previous, { step, input }) => (await previous) ?? this.attempt(read, step, input),
      Promise.resolve(null),
    );

    return (
      concluded ??
      matched(
        read,
        { verdict: 'not_found', examined: [], needsAuthorityCheck: [] },
        null,
        this.settings,
      )
    );
  }

  /** The result of the book if this query settles it, `null` if the cascade goes on. */
  private async attempt(
    read: ReadBook,
    step: CascadeStep,
    input: CatalogQueryInput,
  ): Promise<AttemptResult | null> {
    const page = await this.search(input);
    if (page.kind !== 'ok') {
      return { kind: 'not_verified', cause: causeOf(page) };
    }
    const outcome = await this.match(read, page.value);

    return outcome.verdict === 'not_found' ? null : matched(read, outcome, step, this.settings);
  }

  private async search(input: CatalogQueryInput): Promise<RunOutcome<CatalogPage>> {
    const query = CatalogQuery.of(input);
    if (!query.ok) {
      // A query that cannot be built (a blank title) has nothing to ask: an empty answer.
      return { kind: 'ok', value: { records: [] } };
    }

    return this.runner.run(async (signal) => this.catalog.search(query.value, signal));
  }

  /** The verdict of the page, after the rejected forms of the authorities when they are needed. */
  private async match(read: ReadBook, page: CatalogPage): Promise<MatchOutcome> {
    const first = matchBook(read, page.records, this.settings);
    if (first.verdict !== 'not_found' || first.needsAuthorityCheck.length === 0) {
      return first;
    }

    const forms = await this.formsOf(first.needsAuthorityCheck);

    return forms.size === 0 ? first : matchBook(read, page.records, this.settings, forms);
  }

  private async formsOf(
    checks: readonly AuthorityCheck[],
  ): Promise<Map<string, readonly string[]>> {
    const ids = [...new Set(checks.flatMap((check) => check.authorityIds.map((id) => id.value)))];
    const answers = await Promise.all(
      ids.map(async (id) => [id, await this.rejectedFormsOf(id, checks)] as const),
    );

    return new Map(
      answers.flatMap(([id, forms]) => (forms === undefined ? [] : [[id, forms] as const])),
    );
  }

  private async rejectedFormsOf(
    id: string,
    checks: readonly AuthorityCheck[],
  ): Promise<readonly string[] | undefined> {
    const asked = this.rejectedForms.get(id);
    if (asked !== undefined) {
      return asked;
    }
    const authorityId = checks
      .flatMap((check) => check.authorityIds)
      .find((candidate) => candidate.value === id);
    if (authorityId === undefined) {
      return undefined;
    }

    const request = this.runner
      .run(async (signal) => this.authorities.rejectedForms(authorityId, signal))
      .then((outcome) => (outcome.kind === 'ok' ? outcome.value : undefined));
    this.rejectedForms.set(id, request);

    return request;
  }
}

function matched(
  read: ReadBook,
  outcome: MatchOutcome,
  step: CascadeStep | null,
  settings: MatchingSettings,
): AttemptResult {
  return {
    kind: 'matched',
    outcome,
    step,
    score: reconciliationScore(outcome, step, read.author !== undefined, settings),
  };
}

function causeOf(outcome: Exclude<RunOutcome<unknown>, { kind: 'ok' }>): NotVerifiedCause {
  return outcome.kind === 'failed' ? outcome.cause : 'timeout';
}

/** The queries of each step for this reading; the first two need an author. */
function stepsOf(read: ReadBook): readonly Step[] {
  const author = read.names.at(0) ?? read.author;
  const steps: Step[] = [];

  if (author !== undefined) {
    steps.push(
      {
        step: 'title_and_author',
        queries: [{ title: read.forms[0], author, maxRecords: TITLE_RECORDS, format: 'full' }],
      },
      { step: 'author_only', queries: [{ author, maxRecords: AUTHOR_RECORDS, format: 'light' }] },
    );
  }
  steps.push({
    step: 'title_only',
    queries: read.forms.map((title) => ({
      title,
      maxRecords: TITLE_RECORDS,
      format: 'full' as const,
    })),
  });
  if (read.segments.length > 1) {
    steps.push({
      step: 'segment',
      queries: read.segments.map((title) => ({
        title,
        maxRecords: TITLE_RECORDS,
        format: 'full' as const,
      })),
    });
  }

  return steps;
}
