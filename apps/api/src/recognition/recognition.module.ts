import { Module } from '@nestjs/common';
import {
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
} from '@pick-a-book/recognition-application';
import {
  SHELF_PHOTO_STORAGE_PORT,
  SHELF_SCANNER_PORT,
  SHELF_SCAN_REPOSITORY_PORT,
  type ShelfPhotoStoragePort,
  type ShelfScanRepositoryPort,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';

import type { Environment } from '../config/environment';
import { createShelfScanArchive } from './shelf-scan-archive.factory';
import { ShelfPhotosController } from './shelf-photos.controller';
import { createShelfScanner } from './shelf-scanner.factory';

/**
 * Composition root of the recognition context.
 *
 * This is the only place in the repo allowed to know `recognition-infrastructure`
 * (ADR 0002): the ports are bound to their adapters here, and the use cases only ever see
 * the ports. Which scanner is chosen comes from the validated configuration
 * (`SHELF_SCANNER_PROVIDER`), so swapping providers takes no code change at all — that is
 * what lets the V1 bench two of them (ADR 0005).
 *
 * Three ports now: the VLM, the bucket the photo is kept in, and the database the result is
 * recorded in (ADR 0004, ADR 0006). The archive is built once and shared by both use cases,
 * so a single connection pool serves the whole context.
 */
@Module({})
export class RecognitionModule {
  static withEnvironment(environment: Environment) {
    const archive = createShelfScanArchive(environment);

    return {
      module: RecognitionModule,
      controllers: [ShelfPhotosController],
      providers: [
        {
          provide: SHELF_SCANNER_PORT,
          useFactory: () => createShelfScanner(environment.shelfScanner),
        },
        { provide: SHELF_PHOTO_STORAGE_PORT, useValue: archive.storage },
        { provide: SHELF_SCAN_REPOSITORY_PORT, useValue: archive.repository },
        {
          provide: StoreShelfPhotoUseCase,
          useFactory: (storage: ShelfPhotoStoragePort, repository: ShelfScanRepositoryPort) =>
            new StoreShelfPhotoUseCase(environment.ownerId, storage, repository),
          inject: [SHELF_PHOTO_STORAGE_PORT, SHELF_SCAN_REPOSITORY_PORT],
        },
        {
          provide: ScanStoredShelfPhotoUseCase,
          useFactory: (
            storage: ShelfPhotoStoragePort,
            repository: ShelfScanRepositoryPort,
            scanner: ShelfScannerPort,
          ) => new ScanStoredShelfPhotoUseCase(storage, repository, scanner),
          inject: [SHELF_PHOTO_STORAGE_PORT, SHELF_SCAN_REPOSITORY_PORT, SHELF_SCANNER_PORT],
        },
      ],
      exports: [StoreShelfPhotoUseCase, ScanStoredShelfPhotoUseCase],
    };
  }
}
