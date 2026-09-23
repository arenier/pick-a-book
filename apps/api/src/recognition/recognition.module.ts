import { join } from 'node:path';

import { Module } from '@nestjs/common';
import {
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
} from '@pick-a-book/recognition-application';
import {
  SHELF_PHOTO_STORAGE_PORT,
  SHELF_SCAN_REPOSITORY_PORT,
  SHELF_SCANNER_PORT,
  type ShelfPhotoStoragePort,
  type ShelfScannerPort,
  type ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';

import type { Environment } from '../config/environment';
import { createShelfScanArchive, type ShelfScanArchive } from './shelf-scan-archive.factory';
import { createShelfScanner } from './shelf-scanner.factory';
import { ShelfPhotosController } from './shelf-photos.controller';

const SHELF_SCAN_ARCHIVE = 'ShelfScanArchive';

/**
 * Where the build copies the committed migrations: next to the bundle (`vite.config.mts`),
 * so the image that runs the code also carries the schema that code expects.
 */
const MIGRATIONS_FOLDER = join(__dirname, 'migrations');

/**
 * Composition root of the recognition context.
 *
 * This is the only place in the repo allowed to know `recognition-infrastructure`
 * (ADR 0002): each port is bound to its adapter here, and the use cases only ever see the
 * ports. Which scanner answers comes from the validated configuration
 * (`SHELF_SCANNER_PROVIDER`), so swapping providers takes no code change at all — that is
 * what lets the V1 bench two of them (ADR 0005).
 *
 * The archive (bucket + Postgres) migrates the database before anything is served: a
 * revision never answers a request against a schema it does not know.
 */
@Module({})
export class RecognitionModule {
  static withEnvironment(environment: Environment) {
    return {
      module: RecognitionModule,
      controllers: [ShelfPhotosController],
      providers: [
        {
          provide: SHELF_SCANNER_PORT,
          useFactory: () => createShelfScanner(environment.shelfScanner),
        },
        {
          provide: SHELF_SCAN_ARCHIVE,
          useFactory: async () => {
            const archive = createShelfScanArchive(environment);
            await archive.migrate(MIGRATIONS_FOLDER);
            return archive;
          },
        },
        {
          provide: SHELF_PHOTO_STORAGE_PORT,
          useFactory: (archive: ShelfScanArchive) => archive.storage,
          inject: [SHELF_SCAN_ARCHIVE],
        },
        {
          provide: SHELF_SCAN_REPOSITORY_PORT,
          useFactory: (archive: ShelfScanArchive) => archive.repository,
          inject: [SHELF_SCAN_ARCHIVE],
        },
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
    };
  }
}
