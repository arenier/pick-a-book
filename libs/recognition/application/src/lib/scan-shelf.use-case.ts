import { ShelfPhoto } from '@pick-a-book/recognition-domain';
import type { DetectedBook, ShelfScannerPort } from '@pick-a-book/recognition-domain';

import type { DetectedBookDto, ScanShelfCommand, ScanShelfResult } from './scan-shelf.dto.js';

/**
 * Lit une photo d'etagere et rend les couples (auteur, titre) detectes.
 *
 * Ne parle qu'au port (ADR 0002) : ni HTTP, ni fournisseur de VLM, ni bucket ici.
 * Ne filtre pas les detections faibles — la confiance est remontee telle quelle, et
 * c'est a l'orchestration de decider quoi en faire (ADR 0005).
 */
export class ScanShelfUseCase {
  constructor(private readonly shelfScanner: ShelfScannerPort) {}

  async execute(command: ScanShelfCommand): Promise<ScanShelfResult> {
    const photo = ShelfPhoto.of(command.bytes, command.mediaType);
    const detected = await this.shelfScanner.scan(photo);

    return { books: detected.map(toDto) };
  }
}

function toDto(book: DetectedBook): DetectedBookDto {
  return {
    author: book.author.value,
    title: book.title.value,
    confidence: book.confidence.value,
  };
}
