/**
 * Nom d'auteur tel que lu sur la tranche.
 *
 * Value object : valide a la construction, jamais une chaine nue dans le domaine
 * (ADR 0002). Ce n'est pas un auteur du referentiel bibliographique — la
 * reconciliation est en aval et appartient a un autre contexte.
 */
export class Author {
  private constructor(readonly value: string) {}

  static of(raw: string): Author {
    const trimmed = raw.trim().replace(/\s+/g, ' ');

    if (trimmed.length === 0) {
      throw new Error('Author : le nom lu ne peut pas etre vide');
    }
    if (trimmed.length > 200) {
      throw new Error(`Author : nom trop long (${trimmed.length} caracteres, 200 au plus)`);
    }

    return new Author(trimmed);
  }

  equals(other: Author): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
