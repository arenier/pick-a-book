import { Module } from '@nestjs/common';
import { ScanShelfUseCase } from '@pick-a-book/recognition-application';
import { SHELF_SCANNER_PORT, type ShelfScannerPort } from '@pick-a-book/recognition-domain';
import { StubShelfScannerAdapter } from '@pick-a-book/recognition-infrastructure';

/**
 * Composition root du contexte de reconnaissance.
 *
 * C'est le seul endroit du repo qui a le droit de connaitre `recognition-infrastructure`
 * (ADR 0002) : le port est lie ici a son adaptateur, et le use case ne voit que le port.
 * Substituer l'adaptateur VLM au bouchon (ADR 0005) est un changement d'une ligne, ici.
 *
 * Aucun endpoint HTTP n'est expose pour l'instant : le parcours de scan viendra avec le
 * contexte de reconciliation et son use case d'orchestration (ADR 0003).
 */
@Module({
  providers: [
    { provide: SHELF_SCANNER_PORT, useClass: StubShelfScannerAdapter },
    {
      provide: ScanShelfUseCase,
      useFactory: (scanner: ShelfScannerPort) => new ScanShelfUseCase(scanner),
      inject: [SHELF_SCANNER_PORT],
    },
  ],
  exports: [ScanShelfUseCase],
})
export class RecognitionModule {}
