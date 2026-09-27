export {
  createI18n,
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type Catalogs,
  type I18n,
  type I18nOptions,
} from './lib/create-i18n.js';
export { catalogProblems } from './lib/catalog-problems.js';
export { I18nProvider, setDefaultI18n, useMessages, type I18nProviderProps } from './lib/react.js';
export { syncDocumentLanguage } from './lib/sync-document-language.js';
