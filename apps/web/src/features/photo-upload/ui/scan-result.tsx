import type { DetectedBook } from '../model/detected-book';
import styles from './photo-upload-screen.module.css';

/**
 * What was read off the photo.
 *
 * An empty list is a result of its own — a shelf whose spines held nothing readable — and
 * says so in words rather than showing an empty list (US1 scenario 3). The confidence that
 * travels with each book is not shown: this screen lists books, not scores.
 */
export function ScanResult({ books }: { books: DetectedBook[] }) {
  if (books.length === 0) {
    return (
      <p className={styles.empty}>
        Aucun livre n&apos;a été détecté sur cette photo. Réessayez en cadrant les tranches de plus
        près.
      </p>
    );
  }

  return (
    <ol className={styles.books}>
      {books.map((book, index) => (
        <li key={`${book.title}-${String(index)}`} className={styles.book}>
          <span className={styles.title}>{book.title}</span>
          {book.author === undefined ? null : <span className={styles.author}>{book.author}</span>}
        </li>
      ))}
    </ol>
  );
}
