import { createInstance, type i18n, type InitOptions, type Resource } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

/** The languages of the interface (ADR 0011). French is the source language. */
export const SUPPORTED_LANGUAGES = ['fr', 'en'];

/** What the interface speaks when the browser speaks none of the supported languages. */
export const FALLBACK_LANGUAGE = 'fr';

/** Every catalog, by language then namespace: `{ fr: { shell: {…}, 'photo-upload': {…} } }`. */
export type Catalogs = Resource;

export type I18n = i18n;

export interface I18nOptions {
  /** Pins the language instead of reading the browser — the specs pin French. */
  readonly language?: string;
  /**
   * Throws on a key no catalog has, and on a missing interpolation value, instead of showing the
   * raw key or a sentence with a hole in it. For the specs, never in production.
   */
  readonly strict?: boolean;
}

/**
 * An instance loaded with every catalog, speaking the browser's language (ADR 0011).
 *
 * The first language of `navigator.languages` that is supported wins, regional variants included
 * (`fr-CA` → `fr`); French otherwise. Nothing is remembered between visits: the detector reads the
 * browser only, it writes nowhere.
 *
 * A fresh instance each call, never the i18next singleton: the specs build several side by side.
 */
export async function createI18n(catalogs: Catalogs, options: I18nOptions = {}): Promise<I18n> {
  const instance = createInstance();
  await instance.use(LanguageDetector).init({
    resources: catalogs,
    ns: Object.keys(catalogs[FALLBACK_LANGUAGE] ?? {}),
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    fallbackLng: FALLBACK_LANGUAGE,
    detection: { order: ['navigator'], caches: [] },
    // React escapes what it renders: escaping here as well would show `&amp;` in a title.
    interpolation: { escapeValue: false },
    ...(options.language === undefined ? {} : { lng: options.language }),
    ...(options.strict === true ? STRICT : {}),
  });
  return instance;
}

const STRICT: InitOptions = {
  saveMissing: true,
  missingKeyHandler: (_languages, namespace, key) => {
    throw new Error(`Missing translation: ${namespace}:${key}`);
  },
  missingInterpolationHandler: (text: string) => {
    throw new Error(`Missing interpolation value in: ${text}`);
  },
};
