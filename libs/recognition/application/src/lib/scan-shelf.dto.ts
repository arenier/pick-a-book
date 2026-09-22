/**
 * Boundary DTOs of the recognition context (ADR 0003).
 *
 * The orchestrator in `apps/api` handles these types only, never a `DetectedBook`. Without
 * that rule, an internal reshuffle of the domain breaks the orchestrator — exactly the
 * coupling ADR 0002 sets out to prevent.
 */
/** What `POST /shelf-photos` hands over: the file, and the name the browser gave it. */
export interface StoreShelfPhotoCommand {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  /** Kept for reference only — it names nothing that is stored (FR-015). */
  readonly originalFilename: string;
}

/**
 * The id the photo was filed under: the object in the bucket, the row in the database and
 * the resource of the second call all answer to it.
 */
export interface StoreShelfPhotoResult {
  readonly id: string;
}

/** What `POST /shelf-photos/{id}/scan` hands over: the id of an already kept photo. */
export interface ScanStoredShelfPhotoCommand {
  readonly id: string;
}

export interface DetectedBookDto {
  /** Absent when the spine carried no readable author (ADR 0005, 2026-09-04 amendment). */
  readonly author?: string;
  readonly title: string;
  /** The model's own self-assessment, in [0, 1]. Not calibrated (ADR 0005). */
  readonly confidence: number;
}

export interface ScanShelfResult {
  readonly books: readonly DetectedBookDto[];
}
