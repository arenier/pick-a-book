/**
 * Titre tel que lu sur la tranche, avant toute reconciliation.
 *
 * Value object : valide a la construction (ADR 0002).
 */
export class BookTitle {
  private constructor(readonly value: string) {}

  static of(raw: string): BookTitle {
    const trimmed = raw.trim().replace(/\s+/g, ' ');

    if (trimmed.length === 0) {
      throw new Error('BookTitle : le titre lu ne peut pas etre vide');
    }
    if (trimmed.length > 500) {
      throw new Error(`BookTitle : titre trop long (${trimmed.length} caracteres, 500 au plus)`);
    }

    return new BookTitle(trimmed);
  }

  equals(other: BookTitle): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
