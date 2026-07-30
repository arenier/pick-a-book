import { Module } from '@nestjs/common';
import { ScanShelfUseCase } from '@pick-a-book/recognition-application';
import { SHELF_SCANNER_PORT, type ShelfScannerPort } from '@pick-a-book/recognition-domain';
import { StubShelfScannerAdapter } from '@pick-a-book/recognition-infrastructure';

/**
 * Composition root of the recognition context.
 *
 * This is the only place in the repo allowed to know `recognition-infrastructure`
 * (ADR 0002): the port is bound to its adapter here, and the use case only ever sees the
 * port. Swapping the stub for the VLM adapter (ADR 0005) is a one-line change, right here.
 *
 * No HTTP endpoint is exposed yet: the scan journey will come with the reconciliation
 * context and its orchestrating use case (ADR 0003).
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
