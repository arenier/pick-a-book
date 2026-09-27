import type { resources } from './resources';

/**
 * Types every key and namespace from the French catalogs, the source language (ADR 0011): a
 * misspelt key or namespace fails the typecheck instead of showing the raw key on screen.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'shell';
    resources: (typeof resources)['fr'];
  }
}
