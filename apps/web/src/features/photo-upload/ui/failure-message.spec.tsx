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

  // specs/002-upload-history, FR-014 and FR-015: a refusal of the cap keeps the photo, and says
  // where to run it again; a refusal of the limit by source only asks for a minute.
  it('tells the daily cap apart: the photo is kept, to be run again from the history', () => {
    expect(wordingOf('dailyQuota')).toBe(
      'Limite d’analyses du jour atteinte. Votre photo est conservée : vous pourrez relancer l’analyse demain depuis l’historique.',
    );
  });

  // specs/002-upload-history, FR-017: a refused upload is not kept — the user sends it again.
  it('tells the daily cap on uploads apart: the photo is not kept, send it again tomorrow', () => {
    expect(wordingOf('dailyUploadQuota')).toBe(
      'Limite d’envois du jour atteinte. Votre photo n’a pas été conservée : renvoyez-la demain.',
    );
  });

  it('tells the limit by source apart: wait a minute', () => {
    expect(wordingOf('rateLimited')).toBe(
      'Trop de demandes en peu de temps. Patientez une minute puis réessayez.',
    );
  });
});
