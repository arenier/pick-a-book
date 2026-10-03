import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DetectedBook } from '../model/detected-book';
import type { HistoryOutcome } from '../model/history-entry';
import type { DetailAnswer } from '../model/history-state';
import { EntryDetailScreen } from './entry-detail-screen';
import type { LoadDetail } from './use-entry-detail';

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

const aBook = (title: string, author?: string): DetectedBook => ({
  author,
  title,
  confidence: 0.9,
});

const found = (
  outcome: HistoryOutcome,
  options: { readonly books?: readonly DetectedBook[]; readonly hasThumbnail?: boolean } = {},
): DetailAnswer => ({
  status: 'found',
  entry: {
    id: anId,
    sentAt: new Date('2026-09-27T14:03:12.481Z'),
    outcome,
    hasThumbnail: options.hasThumbnail ?? true,
  },
  books: options.books,
});

const CAMUS = [aBook('La Peste', 'Albert Camus'), aBook('Les Choses')];

/** A `load` that answers as told, and records the ids it was asked for. */
function aServer(...answers: DetailAnswer[]) {
  const asked: string[] = [];
  const load = vi.fn<LoadDetail>(async (id) => {
    asked.push(id);

    return answers.at(asked.length - 1) ?? ({ status: 'error', failure: 'unexpected' } as const);
  });

  return { load, asked };
}

const photo = () =>
  screen.getByRole<HTMLImageElement>('img', { name: 'Photo de l’étagère envoyée' });

describe('EntryDetailScreen, loading', () => {
  it('shows that it is loading, first, and asks for the upload of the route', async () => {
    const server = aServer(found({ kind: 'books', count: 2 }, { books: CAMUS }));

    render(<EntryDetailScreen id={anId} load={server.load} />);

    expect(screen.getByRole('status').textContent).toContain('Chargement');
    await waitFor(() => {
      expect(server.asked).toStrictEqual([anId]);
    });
  });
});

describe('EntryDetailScreen, in development', () => {
  it('asks for the upload once, even when React runs its effects twice', async () => {
    const server = aServer(found({ kind: 'books', count: 2 }, { books: CAMUS }));

    render(
      <StrictMode>
        <EntryDetailScreen id={anId} load={server.load} />
      </StrictMode>,
    );

    await screen.findByRole('list');
    expect(server.asked).toStrictEqual([anId]);
  });
});

describe('EntryDetailScreen, a completed analysis', () => {
  it('shows the photo, and the books under it', async () => {
    const server = aServer(found({ kind: 'books', count: 2 }, { books: CAMUS }));

    render(<EntryDetailScreen id={anId} load={server.load} />);

    await screen.findByRole('list');
    expect(photo().getAttribute('src')).toMatch(new RegExp(`/shelf-photos/${anId}/photo$`, 'u'));
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toStrictEqual([
      'La Peste — Albert Camus',
      'Les Choses',
    ]);
  });

  it('says « no book detected » for an analysis that found none', async () => {
    const server = aServer(found({ kind: 'none' }, { books: [] }));

    render(<EntryDetailScreen id={anId} load={server.load} />);

    await waitFor(() => {
      expect(screen.getByText('Aucun livre détecté sur cette photo.')).toBeDefined();
    });
  });
});

// US2, scenario 3: an upload with no books says why, instead of showing an empty list.
describe('EntryDetailScreen, an analysis with no books', () => {
  it('says that the analysis failed', async () => {
    render(<EntryDetailScreen id={anId} load={aServer(found({ kind: 'failed' })).load} />);

    await waitFor(() => {
      expect(screen.getByText('L’analyse de cette photo a échoué.')).toBeDefined();
    });
  });

  it('says that the analysis was not started', async () => {
    render(<EntryDetailScreen id={anId} load={aServer(found({ kind: 'notStarted' })).load} />);

    await waitFor(() => {
      expect(screen.getByText('L’analyse de cette photo n’a pas été lancée.')).toBeDefined();
    });
  });
});

// FR-008: a photo a browser cannot show — a HEIC outside Safari — or the bucket lost; the books
// are on screen all the same.
describe('EntryDetailScreen, a photo that does not load', () => {
  it('falls back to the thumbnail, and keeps the books', async () => {
    const server = aServer(found({ kind: 'books', count: 2 }, { books: CAMUS }));
    render(<EntryDetailScreen id={anId} load={server.load} />);
    await screen.findByRole('list');

    fireEvent.error(photo());

    expect(photo().getAttribute('src')).toMatch(/\/thumbnail$/u);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('falls back to a neutral indicator when the thumbnail fails too', async () => {
    const server = aServer(found({ kind: 'books', count: 2 }, { books: CAMUS }));
    render(<EntryDetailScreen id={anId} load={server.load} />);
    await screen.findByRole('list');

    fireEvent.error(photo());
    fireEvent.error(photo());

    expect(screen.getByRole('img', { name: 'Photo indisponible' })).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('goes straight to the neutral indicator when there is no thumbnail to fall back on', async () => {
    const server = aServer(
      found({ kind: 'books', count: 2 }, { books: CAMUS, hasThumbnail: false }),
    );
    render(<EntryDetailScreen id={anId} load={server.load} />);
    await screen.findByRole('list');

    fireEvent.error(photo());

    expect(screen.getByRole('img', { name: 'Photo indisponible' })).toBeDefined();
  });
});

describe('EntryDetailScreen, a link that leads nowhere', () => {
  it('says the upload is not found, and leads back to the history', async () => {
    render(<EntryDetailScreen id={anId} load={aServer({ status: 'notFound' }).load} />);

    await screen.findByText('Cet envoi est introuvable.');
    expect(screen.getByRole('link', { name: 'Historique' }).getAttribute('href')).toBe(
      '#/historique',
    );
  });
});

describe('EntryDetailScreen, when it could not load', () => {
  it('says it could not reach the server, apart from « not found », and offers to try again', async () => {
    const server = aServer(
      { status: 'error', failure: 'offline' },
      found({ kind: 'books', count: 2 }, { books: CAMUS }),
    );
    render(<EntryDetailScreen id={anId} load={server.load} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Impossible de joindre');
    expect(screen.queryByText('Cet envoi est introuvable.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await screen.findByRole('list');
  });

  it('tells the limit by source apart from an outage', async () => {
    const server = aServer({ status: 'error', failure: 'rateLimited' });
    render(<EntryDetailScreen id={anId} load={server.load} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Trop de demandes en peu de temps. Patientez une minute puis réessayez.',
    );
  });
});

describe('EntryDetailScreen, the way back', () => {
  it('has a link to the history, from the detail of an upload', async () => {
    const server = aServer(found({ kind: 'books', count: 2 }, { books: CAMUS }));
    render(<EntryDetailScreen id={anId} load={server.load} />);

    await screen.findByRole('list');

    expect(screen.getByRole('link', { name: 'Historique' }).getAttribute('href')).toBe(
      '#/historique',
    );
  });
});
