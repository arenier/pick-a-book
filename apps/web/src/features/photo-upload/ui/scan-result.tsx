import { useMessages } from '@pick-a-book/shared-i18n';

import type { DetectedBook } from '../model/detected-book';

export interface ScanResultProps {
  readonly books: readonly DetectedBook[];
}

/** The books read off the shelf — title first, then the author when the spine showed one. */
export function ScanResult({ books }: ScanResultProps) {
  const { t } = useMessages('photo-upload');

  if (books.length === 0) {
    return <p>{t('result.none')}</p>;
  }

  return (
    <ul className="list-disc pl-5 wrap-anywhere">
      {books.map((book, index) => (
        // The title alone is set in the book typeface (docs/decisions/0002), so it has its own
        // element; the catalog words what follows it.
        // Two spines can carry the same title: the position is the only stable identity.
        // oxlint-disable-next-line react/no-array-index-key
        <li key={index}>
          <span className="font-book font-semibold">{book.title}</span>
          {book.author !== undefined && t('result.byAuthor', { author: book.author })}
        </li>
      ))}
    </ul>
  );
}
