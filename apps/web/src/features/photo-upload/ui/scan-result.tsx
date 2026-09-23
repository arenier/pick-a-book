import type { DetectedBook } from '../model/detected-book';
import styles from './photo-upload-screen.module.css';

export interface ScanResultProps {
  readonly books: readonly DetectedBook[];
}

/** The books read off the shelf — title first, then the author when the spine showed one. */
export function ScanResult({ books }: ScanResultProps) {
  if (books.length === 0) {
    return <p>Aucun livre détecté sur cette photo.</p>;
  }

  return (
    <ul className={styles['books']}>
      {books.map((book, index) => (
        // Two spines can carry the same title: the position is the only stable identity.
        // oxlint-disable-next-line react/no-array-index-key
        <li key={index}>
          {book.author === undefined ? book.title : `${book.title} — ${book.author}`}
        </li>
      ))}
    </ul>
  );
}
