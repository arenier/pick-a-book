import { useMessages } from '@pick-a-book/shared-i18n';

import type { DetectedBook } from '../model/detected-book';
import styles from './photo-upload-screen.module.css';

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
    <ul className={styles['books']}>
      {books.map((book, index) => (
        // Two spines can carry the same title: the position is the only stable identity.
        // oxlint-disable-next-line react/no-array-index-key
        <li key={index}>
          {book.author === undefined
            ? book.title
            : t('result.book', { title: book.title, author: book.author })}
        </li>
      ))}
    </ul>
  );
}
