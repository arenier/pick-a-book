import { useMessages } from '@pick-a-book/shared-i18n';
import { Button } from '@pick-a-book/shared-ui';

import type { ReconciledBook } from '../model/reconciled-book';
import type { ReconciliationState } from '../model/reconciliation-state';
import { FailureMessage } from './failure-message';
import { ReconciledBookItem } from './reconciled-book-item';
import {
  realApi,
  useReconciliation,
  type ReconciliationApi,
  type ReconciliationMode,
} from './use-reconciliation';

/** A detected book, as the list shows it before the catalogue has answered. */
export interface DetectedBookToShow {
  readonly title: string;
  readonly author?: string | undefined;
}

export interface ReconciledBookListProps {
  /** The analysis the books come from — the `id` of the upload. */
  readonly scanId: string;
  /** The books the recognition detected: what is shown while the catalogue answers, or if it fails. */
  readonly books: readonly DetectedBookToShow[];
  readonly mode: ReconciliationMode;
  /** Injected by the specs, the real API client otherwise. */
  readonly api?: ReconciliationApi;
}

/**
 * The books of an analysis with their status against the catalogue (specs/003, US1): « checking »
 * first, then confirmed, ambiguous, unknown to the catalogue or not verified. The books never
 * disappear — whatever happens to the catalogue, they stay on screen (FR-008).
 */
export function ReconciledBookList({
  scanId,
  books,
  mode,
  api = realApi,
}: ReconciledBookListProps) {
  const { state, refusal, choose, retry, retrying, retryFailure } = useReconciliation(
    scanId,
    mode,
    api,
  );
  const { t } = useMessages('reconciliation');
  const shown = booksShown(state, books);
  const failure = retryFailure ?? (state.status === 'failed' ? state.failure : undefined);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {shown.map((book) => (
          <ReconciledBookItem
            key={book.position}
            book={book}
            onChoose={choose}
            refusal={refusal?.position === book.position ? refusal.failure : undefined}
          />
        ))}
      </ul>
      {failure !== undefined && <FailureMessage failure={failure} />}
      {canRetry(state) && (
        <Button variant="outline" disabled={retrying} onClick={retry}>
          {t('retry.label')}
        </Button>
      )}
      <Source books={shown} />
    </div>
  );
}

/** A new check is worth asking for when a book is not verified, or the whole call failed. */
function canRetry(state: ReconciliationState): boolean {
  return (
    state.status === 'failed' ||
    (state.status === 'ready' && state.books.some((book) => book.status === 'not_verified'))
  );
}

/** What each state shows: the answer, or the detected books as being checked or not verified. */
function booksShown(
  state: ReconciliationState,
  detected: readonly DetectedBookToShow[],
): readonly ReconciledBook[] {
  if (state.status === 'ready') {
    return state.books;
  }
  const status = state.status === 'checking' ? 'checking' : 'not_verified';

  return detected.map((book, position) => ({
    position,
    read: { title: book.title, author: book.author },
    status,
  }));
}

/** The catalogue is cited wherever a reference form or a candidate is shown (FR-023). */
function Source({ books }: { readonly books: readonly ReconciledBook[] }) {
  const { t } = useMessages('reconciliation');
  const cites = books.some((book) => book.status === 'confirmed' || book.status === 'ambiguous');

  return cites ? <p className="text-sm text-muted-foreground">{t('source')}</p> : undefined;
}
