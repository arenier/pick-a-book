import type { ShelfScanDetailDto } from '@pick-a-book/recognition-application';
import type { DetectedBookInput } from '@pick-a-book/bibliography-application';

import { ShelfScanNotCompleted } from './shelf-scan-not-completed.error';

/**
 * The books of a completed analysis, as `bibliography` is handed them: their index in the list as
 * their position, their title, their author when there is one. **Never the reading confidence**:
 * it does not enter the verdict (FR-021). Anything but a completed analysis has none to give.
 */
export function detectedBooksOf(
  detail: ShelfScanDetailDto,
): readonly DetectedBookInput[] | ShelfScanNotCompleted {
  if (detail.outcome !== 'completed' || detail.books === undefined) {
    return new ShelfScanNotCompleted(detail.id);
  }

  return detail.books.map((book, position) =>
    book.author === undefined
      ? { position, title: book.title }
      : { position, title: book.title, author: book.author },
  );
}
