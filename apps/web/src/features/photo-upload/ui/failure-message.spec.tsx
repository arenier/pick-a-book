import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UPLOAD_FAILURES } from '../model/upload-failure';
import { FailureMessage } from './failure-message';

function wordingOf(failure: (typeof UPLOAD_FAILURES)[number]) {
  const { unmount } = render(<FailureMessage failure={failure} />);
  const text = screen.getByRole('alert').textContent;
  unmount();
  return text;
}

// FR-006, FR-009: every failure says what happened, in the interface's language (ADR 0011).
describe('FailureMessage', () => {
  it('words a failure for the user', () => {
    expect(wordingOf('upstream')).toBe(
      'Le service de reconnaissance ne répond pas pour le moment. Réessayez dans quelques instants.',
    );
  });

  it('tells every failure apart', () => {
    const wordings = UPLOAD_FAILURES.map((failure) => wordingOf(failure));

    expect(new Set(wordings).size).toBe(UPLOAD_FAILURES.length);
  });

  it('never reads like "no book detected"', () => {
    const wordings = UPLOAD_FAILURES.map((failure) => wordingOf(failure));

    expect(wordings).not.toContain('Aucun livre détecté sur cette photo.');
  });
});
