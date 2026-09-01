import { Module } from '@nestjs/common';
import { ScanShelfUseCase } from '@pick-a-book/recognition-application';
import { SHELF_SCANNER_PORT, type ShelfScannerPort } from '@pick-a-book/recognition-domain';

import type { Environment } from '../config/environment';
import { ScanController } from './scan.controller';
import { createShelfScanner } from './shelf-scanner.factory';

/**
 * Composition root of the recognition context.
 *
 * This is the only place in the repo allowed to know `recognition-infrastructure`
 * (ADR 0002): the port is bound to its adapter here, and the use case only ever sees the
 * port. Which adapter is chosen comes from the validated configuration
 * (`SHELF_SCANNER_PROVIDER`), so swapping providers takes no code change at all — that is
 * what lets the V1 bench two of them (ADR 0005).
 */
@Module({})
export class RecognitionModule {
  static withEnvironment(environment: Environment) {
    return {
      module: RecognitionModule,
      controllers: [ScanController],
      providers: [
        {
          provide: SHELF_SCANNER_PORT,
          useFactory: () => createShelfScanner(environment.shelfScanner),
        },
        {
          provide: ScanShelfUseCase,
          useFactory: (scanner: ShelfScannerPort) => new ScanShelfUseCase(scanner),
          inject: [SHELF_SCANNER_PORT],
        },
      ],
      exports: [ScanShelfUseCase],
    };
  }
}
