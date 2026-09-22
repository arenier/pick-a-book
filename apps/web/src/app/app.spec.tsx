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

  // The shell's only job now: mount the one feature there is (ADR 0002, feature slices).
  it('mounts the photo upload screen', () => {
    render(<App />);

    expect(screen.getByLabelText(/photo/iu)).toBeDefined();
    expect(screen.getByRole('button', { name: /analyser/iu })).toBeDefined();
  });
});
