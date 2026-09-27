import type { resources } from './resources';

/**
 * Types every key and namespace from the French catalogs, the source language (ADR 0011): a
 * misspelt key or namespace fails the typecheck instead of showing the raw key on screen.
 *
 * A type declaration only — the one mention of i18next outside `@pick-a-book/shared-i18n`. It
 * imports nothing at runtime; `useMessages` reads these types through the facade.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: (typeof resources)['fr'];
  }
}
