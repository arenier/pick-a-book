import { Module, type Provider } from '@nestjs/common';
import {
  GetShelfPhotoImageUseCase,
  GetShelfScanUseCase,
  ListShelfScansUseCase,
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
import type { Pool } from 'pg';

import type { Environment } from '../config/environment';
import { DATABASE_POOL } from '../database/database.module';
import { createShelfScanArchive, type ShelfScanArchive } from './shelf-scan-archive.factory';
import { createShelfScanner } from './shelf-scanner.factory';
import { ShelfPhotosController } from './shelf-photos.controller';

const SHELF_SCAN_ARCHIVE = 'ShelfScanArchive';

/**
 * How long an open attempt blocks another analysis of the same photo: far above the ~30 s a
 * scan takes (docs/decisions/0001), short enough that a scan whose instance died is not stuck
 * (specs/002-upload-history, research.md §8).
 */
const ATTEMPT_LEASE_MS = 5 * 60 * 1000;

/**
 * Composition root of the recognition context.
 *
 * This is the only place in the repo allowed to know `recognition-infrastructure`
 * (ADR 0002): each port is bound to its adapter here, and the use cases only ever see the
 * ports. Which scanner answers comes from the validated configuration
 * (`SHELF_SCANNER_PROVIDER`), so swapping providers takes no code change at all — that is
 * what lets the V1 bench two of them (ADR 0005).
 *
 * The database is the API's one pool, opened, migrated and closed by `DatabaseModule`.
 */
@Module({})
export class RecognitionModule {
  static withEnvironment(environment: Environment) {
    return {
      module: RecognitionModule,
      controllers: [ShelfPhotosController],
      // The way out of the context for the orchestrator (ADR 0003): the detail of an analysis.
      exports: [GetShelfScanUseCase],
      providers: [
        {
          provide: SHELF_SCANNER_PORT,
          useFactory: () => createShelfScanner(environment.shelfScanner),
        },
        {
          provide: SHELF_SCAN_ARCHIVE,
          useFactory: (pool: Pool) => createShelfScanArchive(environment, pool),
          inject: [DATABASE_POOL],
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
        ...providersOfUseCases(environment),
      ],
    };
  }
}

/**
 * The use cases, each over the ports it needs and the configured owner — the composition root
 * is the only place that knows both (ADR 0002).
 */
function providersOfUseCases(environment: Environment): Provider[] {
  return [
    {
      provide: StoreShelfPhotoUseCase,
      useFactory: (storage: ShelfPhotoStoragePort, repository: ShelfScanRepositoryPort) =>
        new StoreShelfPhotoUseCase(environment.ownerId, storage, repository, {
          dailyLimit: environment.dailyUploadLimit,
          timeZone: 'Europe/Paris',
        }),
      inject: [SHELF_PHOTO_STORAGE_PORT, SHELF_SCAN_REPOSITORY_PORT],
    },
    {
      provide: ListShelfScansUseCase,
      useFactory: (repository: ShelfScanRepositoryPort) =>
        new ListShelfScansUseCase(environment.ownerId, repository),
      inject: [SHELF_SCAN_REPOSITORY_PORT],
    },
    {
      provide: GetShelfScanUseCase,
      useFactory: (repository: ShelfScanRepositoryPort) =>
        new GetShelfScanUseCase(environment.ownerId, repository),
      inject: [SHELF_SCAN_REPOSITORY_PORT],
    },
    {
      provide: GetShelfPhotoImageUseCase,
      useFactory: (storage: ShelfPhotoStoragePort, repository: ShelfScanRepositoryPort) =>
        new GetShelfPhotoImageUseCase(environment.ownerId, storage, repository),
      inject: [SHELF_PHOTO_STORAGE_PORT, SHELF_SCAN_REPOSITORY_PORT],
    },
    {
      provide: ScanStoredShelfPhotoUseCase,
      useFactory: (
        storage: ShelfPhotoStoragePort,
        repository: ShelfScanRepositoryPort,
        scanner: ShelfScannerPort,
      ) =>
        new ScanStoredShelfPhotoUseCase(environment.ownerId, storage, repository, scanner, {
          dailyLimit: environment.dailyScanLimit,
          timeZone: 'Europe/Paris',
          lease: ATTEMPT_LEASE_MS,
        }),
      inject: [SHELF_PHOTO_STORAGE_PORT, SHELF_SCAN_REPOSITORY_PORT, SHELF_SCANNER_PORT],
    },
  ];
}
