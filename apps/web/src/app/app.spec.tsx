import { createI18n, I18nProvider } from '@pick-a-book/shared-i18n';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resources } from '../i18n/resources';
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

  // ADR 0011: the same screen, in the other language the interface speaks.
  it('speaks English to an English-speaking browser', async () => {
    const english = await createI18n(resources, { language: 'en' });

    render(
      <I18nProvider i18n={english}>
        <App />
      </I18nProvider>,
    );

    expect(screen.getByText('Take a photo of a shelf to see the books on it.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Analyse the photo' })).toBeDefined();
  });
});

// specs/002-upload-history, FR-001: the history is reached from the upload screen, by a link
// whose target is a fragment — the only addressing a static bucket allows.
describe('App, navigation', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('shows the upload screen on #/, with a link to the history', () => {
    window.location.hash = '#/';

    render(<App />);

    expect(screen.getByRole('button', { name: 'Analyser la photo' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Historique' }).getAttribute('href')).toBe(
      '#/historique',
    );
  });

  it('shows the upload screen when there is no fragment at all', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Analyser la photo' })).toBeDefined();
  });

  it('speaks English to the link as well', async () => {
    const english = await createI18n(resources, { language: 'en' });

    render(
      <I18nProvider i18n={english}>
        <App />
      </I18nProvider>,
    );

    expect(screen.getByRole('link', { name: 'History' })).toBeDefined();
  });
});

/** A `fetch` that answers every request with an empty history — enough to mount the screen. */
function stubAnEmptyHistory() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ items: [], nextCursor: null })),
  );
}

describe('App, the history', () => {
  afterEach(() => {
    window.location.hash = '';
    vi.unstubAllGlobals();
  });

  it('shows the history on #/historique, and not the upload screen', async () => {
    stubAnEmptyHistory();
    window.location.hash = '#/historique';

    render(<App />);

    await screen.findByText('Vous n’avez encore envoyé aucune photo.');
    expect(screen.queryByRole('button', { name: 'Analyser la photo' })).toBeNull();
  });

  it('leads back to the upload screen by the link of the shell', async () => {
    stubAnEmptyHistory();
    window.location.hash = '#/historique';

    render(<App />);

    await screen.findByText('Vous n’avez encore envoyé aucune photo.');
    expect(screen.getByRole('navigation').textContent).toBe('Nouvelle photo');
    expect(screen.getByRole('link', { name: 'Nouvelle photo' }).getAttribute('href')).toBe('#/');
  });

  it('follows the link of the upload screen to the history', async () => {
    stubAnEmptyHistory();
    window.location.hash = '#/';
    render(<App />);

    act(() => {
      window.location.hash = '#/historique';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    await waitFor(() => {
      expect(screen.getByText('Vous n’avez encore envoyé aucune photo.')).toBeDefined();
    });
  });
});
