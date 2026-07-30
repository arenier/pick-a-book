/**
 * Confiance associee a une detection, dans [0, 1].
 *
 * L'ADR 0005 exige que le port expose une confiance par livre detecte, pour que
 * l'orchestration puisse ecarter ou signaler les detections faibles. Elle n'est pas
 * calibree : c'est une auto-evaluation du modele, a traiter comme telle.
 */
export class Confidence {
  private constructor(readonly value: number) {}

  static of(raw: number): Confidence {
    if (!Number.isFinite(raw)) {
      throw new Error(`Confidence : valeur non numerique (${raw})`);
    }
    if (raw < 0 || raw > 1) {
      throw new Error(`Confidence : valeur hors de [0, 1] (${raw})`);
    }

    return new Confidence(raw);
  }

  isAtLeast(threshold: Confidence): boolean {
    return this.value >= threshold.value;
  }
}
