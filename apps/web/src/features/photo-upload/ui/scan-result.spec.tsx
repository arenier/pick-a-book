import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DetectedBook } from '../model/detected-book';
import { ScanResult } from './scan-result';

const books: readonly DetectedBook[] = [
  { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
  { author: undefined, title: 'Les Choses', confidence: 0.71 },
];

const none: readonly DetectedBook[] = [];

describe('ScanResult', () => {
  it('lists each book by title, with its author when known', () => {
    render(<ScanResult books={books} />);

    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toStrictEqual(['La Peste — Albert Camus', 'Les Choses']);
  });

  it('says so when no book was detected', () => {
    render(<ScanResult books={none} />);

    expect(screen.getByText('Aucun livre détecté sur cette photo.')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
