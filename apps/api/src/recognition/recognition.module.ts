import { join } from 'node:path';

import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
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
 * How long an open attempt blocks another analysis of the same photo: far above the ~30 s a
 * scan takes (docs/decisions/0001), short enough that a scan whose instance died is not stuck
 * (specs/002-upload-history, research.md §8).
 */
const ATTEMPT_LEASE_MS = 5 * 60 * 1000;

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
export class RecognitionModule implements OnApplicationShutdown {
  constructor(
    @Inject(SHELF_SCAN_ARCHIVE) private readonly archive: Pick<ShelfScanArchive, 'close'>,
  ) {}

  /** Releases the Postgres pool when Cloud Run stops the instance (`enableShutdownHooks`). */
  async onApplicationShutdown(): Promise<void> {
    await this.archive.close();
  }

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
          ) =>
            new ScanStoredShelfPhotoUseCase(storage, repository, scanner, {
              dailyLimit: environment.dailyScanLimit,
              timeZone: 'Europe/Paris',
              lease: ATTEMPT_LEASE_MS,
            }),
          inject: [SHELF_PHOTO_STORAGE_PORT, SHELF_SCAN_REPOSITORY_PORT, SHELF_SCANNER_PORT],
        },
      ],
    };
  }
}
