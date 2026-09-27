import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button, type ButtonProps } from './button';

type Variant = NonNullable<ButtonProps['variant']>;
type Size = NonNullable<ButtonProps['size']>;

const variants = [
  'default',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
] as const satisfies readonly Variant[];
const sizes = ['default', 'lg'] as const satisfies readonly Size[];

/** Height in px of a Tailwind `h-N` class: N × 4px (the default spacing scale). */
function heightOf(element: HTMLElement) {
  const match = /(?:^|\s)h-(\d+)(?:\s|$)/u.exec(element.className);
  return match === null ? 0 : Number(match[1]) * 4;
}

describe('Button', () => {
  it('is a native button that never submits a form by accident', () => {
    render(<Button>Analyser</Button>);

    expect(screen.getByRole('button', { name: 'Analyser' }).getAttribute('type')).toBe('button');
  });

  it('still submits when asked to', () => {
    render(<Button type="submit">Envoyer</Button>);

    expect(screen.getByRole('button', { name: 'Envoyer' }).getAttribute('type')).toBe('submit');
  });

  // docs/decisions/0002: 44px touch targets, measured on the model screen of ADR 0012.
  it.each(sizes)('is at least 44px high in size %s', (size) => {
    render(<Button size={size}>Analyser</Button>);

    expect(heightOf(screen.getByRole('button'))).toBeGreaterThanOrEqual(44);
  });

  it.each(variants)('keeps the touch target in variant %s', (variant) => {
    render(<Button variant={variant}>Analyser</Button>);

    expect(heightOf(screen.getByRole('button'))).toBeGreaterThanOrEqual(44);
  });

  it('stops animating when the phone asks for reduced motion', () => {
    render(<Button>Analyser</Button>);

    expect(screen.getByRole('button').className).toContain('motion-reduce:transition-none');
  });
});
