import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createI18n } from './create-i18n';
import { catalogs } from './fixtures';
import { I18nProvider, setDefaultI18n, useMessages } from './react';

function Greeting() {
  const { t } = useMessages('demo');
  return <p>{t('greeting', { name: 'Ada' })}</p>;
}

// The only API a slice sees (ADR 0011): a namespace in, a typed `t` out.
describe('useMessages', () => {
  it('reads its namespace from the instance a provider hands down', async () => {
    const english = await createI18n(catalogs, { language: 'en' });

    render(
      <I18nProvider i18n={english}>
        <Greeting />
      </I18nProvider>,
    );

    expect(screen.getByText('Hello Ada')).toBeDefined();
  });

  it('falls back on the default instance without a provider', async () => {
    setDefaultI18n(await createI18n(catalogs, { language: 'fr' }));

    render(<Greeting />);

    expect(screen.getByText('Bonjour Ada')).toBeDefined();
  });
});
