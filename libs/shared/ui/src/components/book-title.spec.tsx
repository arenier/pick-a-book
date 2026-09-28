import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BookTitle } from './book-title';

// docs/decisions/0002: a book's title, and nothing else, is set in the book typeface.
describe('BookTitle', () => {
  it('sets the title in the book typeface', () => {
    render(<BookTitle>La Peste</BookTitle>);

    expect(screen.getByText('La Peste').className).toMatch(/(?:^|\s)font-book(?:\s|$)/u);
  });

  it('stays inline, so that it can sit inside a sentence', () => {
    render(<BookTitle>La Peste</BookTitle>);

    expect(screen.getByText('La Peste').tagName).toBe('SPAN');
  });
});
