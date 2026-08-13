import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  type ShelfPhoto,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';

/**
 * Stub adapter: returns a fixed set of detections, calling nothing at all.
 *
 * It stands in for the VLM adapter chosen in ADR 0005 (option B), which is out of scope for
 * this scaffolding. Its point is to make the hexagonal chain runnable end to end: the port
 * exists, the composition root binds it, the use case runs.
 *
 * It also allows working on the frontend without an API key or a bill, and serves as the
 * reference for the future recorded-response adapter (deterministic tests, ADR 0005).
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
