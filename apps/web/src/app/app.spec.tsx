import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../i18n/create-i18n';
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
    const english = await createI18n({ lng: 'en' });

    render(
      <I18nextProvider i18n={english}>
        <App />
      </I18nextProvider>,
    );

    expect(screen.getByText('Take a photo of a shelf to see the books on it.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Analyse the photo' })).toBeDefined();
  });
});
