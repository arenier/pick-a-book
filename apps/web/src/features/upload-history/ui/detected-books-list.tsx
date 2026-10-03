import { useMessages } from '@pick-a-book/shared-i18n';
import { BookTitle } from '@pick-a-book/shared-ui';

import type { DetectedBook } from '../model/detected-book';

export interface DetectedBooksListProps {
  readonly books: readonly DetectedBook[];
}

/**
 * The books of an analysis — title first, then the author when the spine showed one
 * (specs/002-upload-history, FR-007).
 *
 * A local copy of the list `photo-upload` shows, on purpose: a slice does not import another,
 * and twenty lines do not justify a shared lib yet (research.md §11).
 */
export function DetectedBooksList({ books }: DetectedBooksListProps) {
  const { t } = useMessages('upload-history');

  if (books.length === 0) {
    return <p>{t('books.none')}</p>;
  }

  return (
    <ul className="list-disc pl-5 wrap-anywhere">
      {books.map((book, index) => (
        // The title alone is set in the book typeface (docs/decisions/0002), so it has its own
        // element; the catalog words what follows it.
        // Two spines can carry the same title: the position is the only stable identity.
        // oxlint-disable-next-line react/no-array-index-key
        <li key={index}>
          <BookTitle>{book.title}</BookTitle>
          {book.author !== undefined && t('books.byAuthor', { author: book.author })}
        </li>
      ))}
    </ul>
  );
}
