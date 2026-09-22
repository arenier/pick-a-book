import type { DetectedBook } from './detected-book';

/**
 * What the screen is doing, as one value.
 *
 * A discriminated union rather than a handful of booleans: `loading` and `error` cannot both
 * be true, an error always carries its message, and a success always carries its list —
 * states the screen would otherwise have to be trusted not to produce (FR-004, FR-006).
 *
 * Transitions: `idle → uploading → success | error`, then back to `idle` on "recommencer"
 * (US4, FR-008). Nothing leads from `uploading` to `uploading`: that is FR-007, one analysis
 * at a time.
 */
export type UploadState =
  | { readonly status: 'idle' }
  | { readonly status: 'uploading' }
  | { readonly status: 'success'; readonly books: DetectedBook[] }
  | { readonly status: 'error'; readonly message: string };

export const IDLE: UploadState = { status: 'idle' };
