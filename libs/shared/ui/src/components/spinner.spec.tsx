import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from './spinner';

// The text next to it says what is happening, in the interface's language (ADR 0011): the
// spinner itself says nothing, and carries no English "Loading".
describe('Spinner', () => {
  it('is decorative, hidden from assistive technologies', () => {
    const { container } = render(<Spinner />);

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('[aria-label]')).toBeNull();
  });

  it('stops spinning when the phone asks for reduced motion', () => {
    const { container } = render(<Spinner />);

    expect(container.querySelector('svg')?.getAttribute('class')).toContain(
      'motion-reduce:animate-none',
    );
  });
});
