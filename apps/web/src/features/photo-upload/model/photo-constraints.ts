/**
 * What the API accepts as a shelf photo, checked before sending so a refusal is immediate
 * (specs/001-photo-upload, FR-003, FR-009).
 *
 * The same values as `ShelfPhoto` in the recognition domain, copied rather than imported:
 * `apps/web` may not depend on a `scope:api` lib (research.md §5). The server checks again —
 * this is for comfort, never for safety.
 */
export const ACCEPTED_MEDIA_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

/** 20 MB. */
export const MAX_SIZE_IN_BYTES = 20_971_520;

type Photo = { readonly type: string; readonly size: number };

/** Checked in order: the first rule a file breaks is the one the user is told about. */
const RULES: readonly (readonly [(photo: Photo) => boolean, string])[] = [
  [
    (photo) => !ACCEPTED_MEDIA_TYPES.includes(photo.type),
    'Ce fichier n’est pas une photo prise en charge : choisissez une image JPEG, PNG, WebP ou HEIC.',
  ],
  [(photo) => photo.size === 0, 'Ce fichier est vide.'],
  [
    (photo) => photo.size > MAX_SIZE_IN_BYTES,
    'Cette photo dépasse 20 Mo : choisissez-en une plus légère.',
  ],
];

/** Why this file cannot be sent, in words for the user — or `undefined` when it can. */
export function photoProblem(photo: Photo): string | undefined {
  return RULES.find(([breaks]) => breaks(photo))?.[1];
}
