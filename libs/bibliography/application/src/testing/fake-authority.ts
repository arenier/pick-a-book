import {
  CatalogUnavailable,
  type AuthorityId,
  type AuthorityPort,
} from '@pick-a-book/bibliography-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

/** The authorities in a spec's hands: the forms rejected for each identifier, or a failure. */
export class FakeAuthority implements AuthorityPort {
  /** The identifiers asked for, in order: a spec counts how many times each one was. */
  readonly asked: string[] = [];

  constructor(
    private readonly answers: Readonly<Record<string, readonly string[] | CatalogUnavailable>> = {},
  ) {}

  async rejectedForms(
    id: AuthorityId,
    _signal: AbortSignal,
  ): Promise<Result<readonly string[], CatalogUnavailable>> {
    this.asked.push(id.value);
    const answer = this.answers[id.value] ?? [];

    return answer instanceof CatalogUnavailable ? err(answer) : ok(answer);
  }
}
