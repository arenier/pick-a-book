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
  // The day's analyses are used up: the photo is kept, to be run again from the history
  // (specs/002-upload-history, FR-015).
  'dailyQuota',
  // Too many requests from this source in a short time: a minute's wait (FR-014).
  'rateLimited',
  'offline',
  'unexpected',
] as const;

export type UploadFailure = (typeof UPLOAD_FAILURES)[number];
