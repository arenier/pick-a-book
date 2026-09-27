import { afterEach, describe, expect, it, vi } from 'vitest';

import { createI18n } from './create-i18n';
import { catalogs } from './fixtures';

/** The browser's language preferences, most preferred first — as `navigator.languages` gives them. */
function browserSpeaks(...languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '');
}

// ADR 0011: the interface follows the browser, and falls back to French.
describe('createI18n, choosing the language', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [['en-US', 'en'], 'en'],
    [['de-DE', 'en-GB'], 'en'],
    [['fr-CA'], 'fr'],
    [['pt-BR', 'fr-FR', 'en'], 'fr'],
  ])('picks the first supported language of %j', async (languages, expected) => {
    browserSpeaks(...languages);

    const i18n = await createI18n(catalogs);

    expect(i18n.resolvedLanguage).toBe(expected);
  });

  it('falls back to French when the browser speaks neither language', async () => {
    browserSpeaks('de-DE', 'it');

    const i18n = await createI18n(catalogs);

    expect(i18n.resolvedLanguage).toBe('fr');
  });

  it('uses the language it is given over the browser', async () => {
    browserSpeaks('en-US');

    const i18n = await createI18n(catalogs, { language: 'fr' });

    expect(i18n.resolvedLanguage).toBe('fr');
  });
});

describe('createI18n, loading the catalogs', () => {
  it.each(['fr', 'en'])('loads every namespace in %s', async (language) => {
    const i18n = await createI18n(catalogs, { language });

    expect(i18n.hasResourceBundle(language, 'demo')).toBe(true);
  });
});

// The specs of the front run strict: a hole in a sentence fails the test instead of showing.
describe('createI18n, when strict', () => {
  it('throws on a key no catalog has', async () => {
    const i18n = await createI18n(catalogs, { language: 'fr', strict: true });

    expect(() => i18n.t('demo:farewell')).toThrow('Missing translation: demo:farewell');
  });

  it('throws on a missing interpolation value', async () => {
    const i18n = await createI18n(catalogs, { language: 'fr', strict: true });

    expect(() => i18n.t('demo:greeting')).toThrow('Missing interpolation value');
  });

  it('shows the key rather than throwing, when not strict', async () => {
    const i18n = await createI18n(catalogs, { language: 'fr' });

    expect(i18n.t('demo:farewell')).toBe('farewell');
  });
});
