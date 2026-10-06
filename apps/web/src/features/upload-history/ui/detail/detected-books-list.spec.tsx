import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DetectedBook } from '../../model/detected-book';
import { DetectedBooksList } from './detected-books-list';

const aBook = (title: string, author?: string): DetectedBook => ({
  author,
  title,
  confidence: 0.9,
});

// Lists made once, outside the renders: a new array on each render would look like new data.
const CAMUS_THEN_CHOSES = [aBook('La Peste', 'Albert Camus'), aBook('Les Choses')];
const WITHOUT_AUTHOR = [aBook('Les Choses')];
const NO_BOOKS: DetectedBook[] = [];
const TWICE_THE_SAME = [aBook('Poésies'), aBook('Poésies')];

// FR-007: the books as the analysis got them, title first, then the author when the spine had one.
describe('DetectedBooksList', () => {
  it('lists the books in the order they come', () => {
    render(<DetectedBooksList books={CAMUS_THEN_CHOSES} />);

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toStrictEqual([
      'La Peste — Albert Camus',
      'Les Choses',
    ]);
  });

  it('shows no author, and no dash, for a spine that had none', () => {
    render(<DetectedBooksList books={WITHOUT_AUTHOR} />);

    expect(screen.getByRole('listitem').textContent).toBe('Les Choses');
  });

  it('says so when the analysis found no book', () => {
    render(<DetectedBooksList books={NO_BOOKS} />);

    expect(screen.getByText('Aucun livre détecté sur cette photo.')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });

  // Two spines can carry the same title: neither is dropped.
  it('keeps two books of the same title', () => {
    render(<DetectedBooksList books={TWICE_THE_SAME} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
