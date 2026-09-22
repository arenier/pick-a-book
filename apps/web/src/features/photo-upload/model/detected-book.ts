/**
 * A book read off a shelf photo, as `POST /shelf-photos/{id}/scan` hands it back.
 *
 * A deliberate local copy of the API's own DTO, not an import of it: `scope:web` never
 * depends on `scope:api` (ADR 0002, enforced by `@nx/enforce-module-boundaries`). The
 * contract this mirrors is written down in
 * `specs/001-photo-upload/contracts/scan-api.md`, which is what both sides answer to.
 */
export interface DetectedBook {
  /** Absent when the spine carried no readable author (ADR 0005) — never an empty string. */
  readonly author: string | undefined;
  readonly title: string;
  /** Carried by the contract, shown to nobody: the screen lists books, not scores. */
  readonly confidence: number;
}
