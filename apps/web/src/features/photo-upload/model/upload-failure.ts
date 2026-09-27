/**
 * Why a photo was refused before sending — checked in this order, the first rule a file breaks
 * being the one the user is told about (FR-003, FR-009).
 */
export const PHOTO_PROBLEMS = ['unsupportedType', 'empty', 'tooLarge'] as const;

export type PhotoProblem = (typeof PHOTO_PROBLEMS)[number];

/**
 * Every way an upload can fail (data-model.md#UploadFailure, FR-006). A kind, never a sentence:
 * `model/` and `api/` do not know the interface's language — the screen words it (ADR 0011).
 */
export const UPLOAD_FAILURES = [
  ...PHOTO_PROBLEMS,
  'refused',
  'upstream',
  'offline',
  'unexpected',
] as const;

export type UploadFailure = (typeof UPLOAD_FAILURES)[number];
