import { createI18n, I18nProvider } from '@pick-a-book/shared-i18n';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { resources } from '../../../../i18n/resources';
import type { HistoryEntry, HistoryOutcome } from '../../model/history-entry';
import { HistoryEntryCard } from './history-entry-card';

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

const anEntry = (outcome: HistoryOutcome, hasThumbnail = true): HistoryEntry => ({
  id: anId,
  sentAt: new Date('2026-09-27T14:03:12.481Z'),
  outcome,
  hasThumbnail,
});

const books = (count: number): HistoryOutcome => ({ kind: 'books', count });

// FR-004: when the photo was sent, in the user's own date and time.
describe('HistoryEntryCard, the date', () => {
  it('shows the date and the time of the upload, in the language of the interface', () => {
    render(<HistoryEntryCard entry={anEntry(books(2))} />);

    const expected = new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' });
    expect(screen.getByText(expected.format(new Date('2026-09-27T14:03:12.481Z')))).toBeDefined();
  });

  it('gives it as a machine-readable date too', () => {
    const { container } = render(<HistoryEntryCard entry={anEntry(books(2))} />);

    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-09-27T14:03:12.481Z',
    );
  });
});

// FR-005: the four outcomes, told apart in words. « 1 livre » and « 12 livres » are one plural
// key, so the parity test of the catalogs checks the forms of each language.
describe('HistoryEntryCard, the outcome', () => {
  it.each([
    [books(12), '12 livres détectés'],
    [books(1), '1 livre détecté'],
    [{ kind: 'none' } as const, 'Aucun livre détecté'],
    [{ kind: 'failed' } as const, 'Analyse en échec'],
    [{ kind: 'notStarted' } as const, 'Analyse non lancée'],
  ])('says %j as « %s »', (outcome, text) => {
    render(<HistoryEntryCard entry={anEntry(outcome)} />);

    expect(screen.getByText(text)).toBeDefined();
  });

  it('says it in English to an English-speaking browser', async () => {
    const english = await createI18n(resources, { language: 'en' });

    render(
      <I18nProvider i18n={english}>
        <HistoryEntryCard entry={anEntry(books(1))} />
      </I18nProvider>,
    );

    expect(screen.getByText('1 book detected')).toBeDefined();
  });
});

const thumbnail = () => screen.getByRole<HTMLImageElement>('img', { name: 'Vignette de la photo' });

describe('HistoryEntryCard, the thumbnail', () => {
  it('loads it lazily, from the API', () => {
    render(<HistoryEntryCard entry={anEntry(books(2))} />);

    expect(thumbnail().getAttribute('loading')).toBe('lazy');
    expect(thumbnail().getAttribute('src')).toMatch(
      new RegExp(`/shelf-photos/${anId}/thumbnail$`, 'u'),
    );
  });

  // FR-008: a photo sent without a thumbnail is never asked for one.
  it('shows a neutral indicator, and asks for nothing, when the upload has none', () => {
    const { container } = render(<HistoryEntryCard entry={anEntry(books(2), false)} />);

    expect(screen.getByRole('img', { name: 'Vignette indisponible' })).toBeDefined();
    expect(container.querySelector('img')).toBeNull();
  });

  it('falls back to the neutral indicator when the thumbnail fails to load', () => {
    render(<HistoryEntryCard entry={anEntry(books(2))} />);

    fireEvent.error(thumbnail());

    expect(screen.getByRole('img', { name: 'Vignette indisponible' })).toBeDefined();
  });
});

describe('HistoryEntryCard, the link', () => {
  it('leads to the detail of the upload', () => {
    render(<HistoryEntryCard entry={anEntry(books(2))} />);

    expect(screen.getByRole('link').getAttribute('href')).toBe(`#/historique/${anId}`);
  });
});
