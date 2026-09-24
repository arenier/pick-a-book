/**
 * A book detected on the shelf, as `POST /shelf-photos/{id}/scan` returns it
 * (specs/001-photo-upload, contracts/scan-api.md).
 *
 * A local copy of the API contract, on purpose: `apps/web` may not import the `scope:api`
 * libs, where `DetectedBookDto` lives (research.md §5).
 */
export interface DetectedBook {
  /** Absent when the spine carried no readable author — never shown as an empty string. */
  readonly author: string | undefined;
  readonly title: string;
  /** Carried for fidelity to the contract; this feature does not display it. */
  readonly confidence: number;
}
