import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert, AlertDescription, AlertTitle } from './alert';

describe('Alert', () => {
  it('is announced as an alert, with its title and description', () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Échec</AlertTitle>
        <AlertDescription>Le service ne répond pas.</AlertDescription>
      </Alert>,
    );

    expect(screen.getByRole('alert').textContent).toBe('ÉchecLe service ne répond pas.');
  });

  // docs/decisions/0002: the error text is measured at full opacity (6.39:1); a faded
  // `text-destructive/90` is what axe flagged at 4.49:1 on the model screen.
  it('writes a destructive message at full opacity', () => {
    render(
      <Alert variant="destructive">
        <AlertDescription>Le service ne répond pas.</AlertDescription>
      </Alert>,
    );

    expect(screen.getByRole('alert').className).not.toMatch(/text-destructive\/\d+/u);
  });
});
