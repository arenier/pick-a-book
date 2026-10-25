import {
  type AuthorityId,
  type AuthorityPort,
  type CatalogUnavailable,
} from '@pick-a-book/bibliography-domain';
import { ok, type Result } from '@pick-a-book/shared-result';

/** The rejected forms the stub knows: « Donnadieu, Marguerite » is also written « Duras ». */
const REJECTED_FORMS: Readonly<Record<string, readonly string[]>> = {
  'stub-duras': ['Duras, Marguerite'],
};

/** An authority that answers from memory, with a rejected form to exercise the rule of §5.4. */
export class StubAuthorityAdapter implements AuthorityPort {
  async rejectedForms(
    id: AuthorityId,
    _signal: AbortSignal,
  ): Promise<Result<readonly string[], CatalogUnavailable>> {
    return ok(REJECTED_FORMS[id.value] ?? []);
  }
}
