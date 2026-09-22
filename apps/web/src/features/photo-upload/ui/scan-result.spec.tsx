import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScanResult } from './scan-result';

const twoBooks = [
  { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
  { author: undefined, title: 'Les Choses', confidence: 0.71 },
];
const oneBook = [{ author: 'Albert Camus', title: 'La Peste', confidence: 0.92 }];
const noBook: typeof oneBook = [];

describe('ScanResult', () => {
  it('lists every book read, with its author when the spine carried one', () => {
    render(<ScanResult books={twoBooks} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('La Peste')).toBeDefined();
    expect(screen.getByText('Albert Camus')).toBeDefined();
    expect(screen.getByText('Les Choses')).toBeDefined();
  });

  // Not an error, and not a blank screen: a shelf can genuinely hold nothing readable
  // (US1 scenario 3), and the screen says so in its own words.
  it('says so when no book was read, and offers another try', () => {
    render(<ScanResult books={noBook} />);

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(/aucun livre/iu)).toBeDefined();
  });

  // The confidence travels in the contract but is not the user's business (data-model.md).
  it('never shows the confidence score', () => {
    render(<ScanResult books={oneBook} />);

    expect(screen.queryByText(/0[.,]92/u)).toBeNull();
  });
});
