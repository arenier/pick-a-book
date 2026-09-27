import type { PhotoProblem } from './upload-failure';

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

/** Checked in the order of `PHOTO_PROBLEMS`: the first rule a file breaks is the one reported. */
const RULES: readonly (readonly [(photo: Photo) => boolean, PhotoProblem])[] = [
  [(photo) => !ACCEPTED_MEDIA_TYPES.includes(photo.type), 'unsupportedType'],
  [(photo) => photo.size === 0, 'empty'],
  [(photo) => photo.size > MAX_SIZE_IN_BYTES, 'tooLarge'],
];

/** Why this file cannot be sent — or `undefined` when it can. The screen words it for the user. */
export function photoProblem(photo: Photo): PhotoProblem | undefined {
  return RULES.find(([breaks]) => breaks(photo))?.[1];
}
