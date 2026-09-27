import type { DetectedBook } from './detected-book';

/**
 * What the upload screen shows — one state at a time, never two true at once
 * (specs/001-photo-upload, data-model.md#UploadState).
 *
 * `idle → uploading → success | error`, then back to `idle` on "start over". Nothing leaves
 * `uploading` for `uploading`: one submission at a time (FR-007).
 */
export type UploadState =
  | { readonly status: 'idle' }
  | { readonly status: 'uploading' }
  | { readonly status: 'success'; readonly books: readonly DetectedBook[] }
  | { readonly status: 'error'; readonly message: string };
