import { createI18n, I18nProvider } from '@pick-a-book/shared-i18n';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
