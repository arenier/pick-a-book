import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from './input';

describe('Input', () => {
  it('keeps the native attributes and its label', () => {
    render(
      <>
        <label htmlFor="photo">Photo</label>
        <Input id="photo" type="file" accept="image/jpeg" disabled />
      </>,
    );

    const input = screen.getByLabelText('Photo');
    expect(input.getAttribute('type')).toBe('file');
    expect(input.getAttribute('accept')).toBe('image/jpeg');
    expect(input).toHaveProperty('disabled', true);
  });

  // docs/decisions/0002: 44px touch targets, and 16px text on a phone, below which Safari iOS
  // zooms in on focus.
  it('is a 44px touch target with 16px text on a phone', () => {
    render(<Input aria-label="Photo" />);

    const { className } = screen.getByLabelText('Photo');
    expect(className).toMatch(/(?:^|\s)h-11(?:\s|$)/u);
    expect(className).toMatch(/(?:^|\s)text-base(?:\s|$)/u);
  });
});
