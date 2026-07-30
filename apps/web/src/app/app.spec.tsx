import { render, screen } from '@testing-library/react';

import App from './app';

describe('App', () => {
  it('se rend sans erreur', () => {
    const { baseElement } = render(<App />);

    expect(baseElement).toBeTruthy();
  });

  it('affiche le nom du produit', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'pick-a-book' })).toBeTruthy();
  });
});
