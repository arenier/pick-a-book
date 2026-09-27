import { defineConfig } from 'i18next-cli';

/**
 * Checks the catalogs and the code of the front (ADR 0011), run by the `translations` target:
 * `status` fails on a key missing from a translation, `lint` on text written in the JSX instead
 * of going through a catalog.
 *
 * One namespace per slice, stored in the slice; the shell's catalog sits next to the shell.
 */
export default defineConfig({
  locales: ['fr', 'en'],
  extract: {
    input: ['src/**/*.{ts,tsx}'],
    ignore: ['src/**/*.spec.{ts,tsx}', 'src/test-setup.ts'],
    output: (language, namespace) =>
      namespace === 'shell'
        ? `src/app/i18n/${language}.json`
        : `src/features/${namespace ?? ''}/i18n/${language}.json`,
    primaryLanguage: 'fr',
    // The slices read their messages through the facade of @pick-a-book/shared-i18n (ADR 0011).
    useTranslationNames: ['useMessages'],
    defaultNS: 'shell',
  },
});
