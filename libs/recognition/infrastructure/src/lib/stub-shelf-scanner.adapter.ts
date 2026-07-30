import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  type ShelfPhoto,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';

/**
 * Adaptateur bouchon : rend un jeu de detections fixe, sans appeler quoi que ce soit.
 *
 * Il tient la place de l'adaptateur VLM retenu par l'ADR 0005 (solution B), qui n'est pas
 * l'objet de ce scaffolding. Sa raison d'etre est de rendre la chaine hexagonale executable
 * de bout en bout : le port existe, la composition root le lie, le use case tourne.
 *
 * Il permet aussi de developper le frontend sans cle d'API ni facturation, et sert de
 * reference au futur adaptateur sur reponses enregistrees (tests deterministes, ADR 0005).
 */
export class StubShelfScannerAdapter implements ShelfScannerPort {
  private static readonly SAMPLE: ReadonlyArray<[string, string, number]> = [
    ['Marguerite Duras', "L'Amant", 0.94],
    ['Georges Perec', 'Les Choses', 0.88],
    ['Annie Ernaux', 'La Place', 0.71],
    ['Auteur peu lisible', 'Titre peu lisible', 0.31],
  ];

  async scan(_photo: ShelfPhoto): Promise<DetectedBook[]> {
    return StubShelfScannerAdapter.SAMPLE.map(([author, title, confidence]) =>
      DetectedBook.of(Author.of(author), BookTitle.of(title), Confidence.of(confidence)),
    );
  }
}
