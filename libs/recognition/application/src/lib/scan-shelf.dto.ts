/**
 * Boundary DTOs of the recognition context (ADR 0003).
 *
 * The orchestrator in `apps/api` handles these types only, never a `DetectedBook`. Without
 * that rule, an internal reshuffle of the domain breaks the orchestrator — exactly the
 * coupling ADR 0002 sets out to prevent.
 */
export interface ScanShelfCommand {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

export interface DetectedBookDto {
  readonly author: string;
  readonly title: string;
  /** The model's own self-assessment, in [0, 1]. Not calibrated (ADR 0005). */
  readonly confidence: number;
}

export interface ScanShelfResult {
  readonly books: readonly DetectedBookDto[];
}
