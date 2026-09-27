import { describe, expect, it } from 'vitest';

import { createI18n } from './create-i18n';
import { syncDocumentLanguage } from './sync-document-language';

// Screen readers and the browser's own translation offer read the language from <html lang>.
describe('syncDocumentLanguage', () => {
  it('declares the current language on the document at once', async () => {
    const i18n = await createI18n({ lng: 'en' });
    const html = document.createElement('html');

    syncDocumentLanguage(i18n, html);

    expect(html.lang).toBe('en');
  });

  it('follows every later change of language', async () => {
    const i18n = await createI18n({ lng: 'en' });
    const html = document.createElement('html');
    syncDocumentLanguage(i18n, html);

    await i18n.changeLanguage('fr');

    expect(html.lang).toBe('fr');
  });
});
