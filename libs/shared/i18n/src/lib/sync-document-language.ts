import type { i18n } from 'i18next';

/**
 * Keeps `<html lang>` on the language the interface speaks: screen readers pick their voice from
 * it, and the browser's own translation offer reads it too.
 */
export function syncDocumentLanguage(instance: i18n, html: HTMLElement): void {
  html.lang = instance.resolvedLanguage ?? instance.language;
  instance.on('languageChanged', () => {
    html.lang = instance.resolvedLanguage ?? instance.language;
  });
}
