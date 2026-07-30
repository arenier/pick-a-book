import type { DetectedBook } from './detected-book.js';
import type { ShelfPhoto } from './shelf-photo.js';

/**
 * Port de sortie du contexte de reconnaissance (ADR 0005).
 *
 * Le MVP l'implemente par un VLM seul (solution B). Le passage a la solution C
 * — OCR injecte dans le prompt, rejet des tokens absents du texte OCR — se fait en
 * substituant un adaptateur composite : domaine, application et frontend sont
 * indifferents au choix.
 *
 * L'implementation leve `ShelfScanFailed` si la source est indisponible ou repond
 * hors contrat. Une photo sans livre lisible n'est pas une erreur : c'est un tableau vide.
 */
export interface ShelfScannerPort {
  scan(photo: ShelfPhoto): Promise<DetectedBook[]>;
}

/**
 * Jeton d'injection du port.
 *
 * Une chaine, pas un decorateur : le domaine ne depend d'aucun conteneur d'injection.
 * C'est la composition root de `apps/api` qui s'en sert pour lier le port a un adaptateur.
 */
export const SHELF_SCANNER_PORT = 'ShelfScannerPort';

export class ShelfScanFailed extends Error {
  constructor(reason: string, options?: { cause?: unknown }) {
    super(`Echec du scan d'etagere : ${reason}`, options);
    this.name = 'ShelfScanFailed';
  }
}
