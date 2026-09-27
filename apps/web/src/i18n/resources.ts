import shellEn from '../app/i18n/en.json';
import shellFr from '../app/i18n/fr.json';
import photoUploadEn from '../features/photo-upload/i18n/en.json';
import photoUploadFr from '../features/photo-upload/i18n/fr.json';

/**
 * Every catalog of the front, one namespace per slice plus the shell's (ADR 0011). This is the
 * only module that knows them all — the composition root of the front, as `main.tsx` is; a slice
 * reads its own namespace through `useTranslation`, never another slice's catalog.
 *
 * French is the source language: its catalogs give the keys their types (`i18next.d.ts`).
 */
export const resources = {
  fr: { shell: shellFr, 'photo-upload': photoUploadFr },
  en: { shell: shellEn, 'photo-upload': photoUploadEn },
};

export const SUPPORTED_LANGUAGES = ['fr', 'en'];

/** What the interface speaks when the browser speaks none of the supported languages. */
export const FALLBACK_LANGUAGE = 'fr';
