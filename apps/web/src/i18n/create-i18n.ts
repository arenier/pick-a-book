import { createInstance, type i18n, type InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { FALLBACK_LANGUAGE, resources, SUPPORTED_LANGUAGES } from './resources';

/**
 * An i18next instance loaded with every catalog, speaking the browser's language (ADR 0011).
 *
 * The first language of `navigator.languages` that is supported wins, regional variants
 * included (`fr-CA` → `fr`); French otherwise. Nothing is remembered between visits: the
 * detector reads the browser only, it writes nowhere.
 *
 * A fresh instance each call, never the i18next singleton: the specs build several side by side.
 * `overrides` lets a caller pin the language (`lng`) or tighten the handlers, as the test setup does.
 */
export async function createI18n(overrides: InitOptions = {}): Promise<i18n> {
  const instance = createInstance();
  await instance.use(LanguageDetector).init({
    resources,
    ns: Object.keys(resources.fr),
    defaultNS: 'shell',
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    fallbackLng: FALLBACK_LANGUAGE,
    detection: { order: ['navigator'], caches: [] },
    // React escapes what it renders: escaping here as well would show `&amp;` in a title.
    interpolation: { escapeValue: false },
    ...overrides,
  });
  return instance;
}
