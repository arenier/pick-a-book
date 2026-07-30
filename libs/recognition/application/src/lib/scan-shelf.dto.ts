/**
 * DTO de frontiere du contexte de reconnaissance (ADR 0003).
 *
 * L'orchestrateur de `apps/api` ne manipule que ces types-la, jamais un `DetectedBook`.
 * Sans cette regle, un remaniement interne du domaine casse l'orchestrateur — precisement
 * le couplage que l'ADR 0002 cherche a empecher.
 */
export interface ScanShelfCommand {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

export interface DetectedBookDto {
  readonly author: string;
  readonly title: string;
  /** Auto-evaluation du modele dans [0, 1]. Non calibree (ADR 0005). */
  readonly confidence: number;
}

export interface ScanShelfResult {
  readonly books: readonly DetectedBookDto[];
}
