import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge';

// A badge is a short label, not a control (ADR 0012): the words come from the slice's catalog.
describe('Badge', () => {
  it('shows the words it is given and nothing else', () => {
    render(<Badge>Confirmé</Badge>);

    expect(screen.getByText('Confirmé').textContent).toBe('Confirmé');
  });

  it('is not interactive: no role of a control, not focusable', () => {
    render(<Badge>Confirmé</Badge>);

    const badge = screen.getByText('Confirmé');
    expect(badge.getAttribute('role')).toBeNull();
    expect(badge.getAttribute('tabindex')).toBeNull();
  });

  it('keeps its words whole on one line, whatever the width of a phone', () => {
    render(<Badge>Non vérifié</Badge>);

    expect(screen.getByText('Non vérifié').className).toContain('whitespace-nowrap');
  });

  it.each([
    ['default', 'bg-secondary'],
    ['outline', 'border'],
    ['destructive', 'text-destructive'],
  ] as const)('writes the %s variant with the tokens of the theme', (variant, token) => {
    render(<Badge variant={variant}>Libellé</Badge>);

    expect(screen.getByText('Libellé').className).toContain(token);
  });

  // docs/decisions/0002: text is measured at full opacity.
  it('writes no text at a reduced opacity', () => {
    render(<Badge variant="destructive">Libellé</Badge>);

    expect(screen.getByText('Libellé').className).not.toMatch(/text-\S+\/\d+/u);
  });
});
