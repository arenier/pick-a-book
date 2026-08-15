import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './app';

describe('App', () => {
  it('renders without error', () => {
    const { baseElement } = render(<App />);

    expect(baseElement).toBeDefined();
  });

  it('displays the product name', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'pick-a-book' })).toBeDefined();
  });
});
