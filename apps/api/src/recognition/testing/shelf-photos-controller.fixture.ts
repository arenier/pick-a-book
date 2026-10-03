import {
  GetShelfPhotoImageUseCase,
  ListShelfScansUseCase,
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
} from '@pick-a-book/recognition-application';
import {
  OwnerId,
  type ScanAttemptPolicy,
  type ShelfPhotoStoragePort,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';
import { StubShelfScannerAdapter } from '@pick-a-book/recognition-infrastructure';
import { unwrap } from '@pick-a-book/shared-result';

import { ShelfPhotosController } from '../shelf-photos.controller';
import { InMemoryPhotoStorage } from './in-memory-photo-storage';
import { InMemoryScanRepository } from './in-memory-scan-repository';

/** The policy of production, unless a spec wants another: 50 a day, a 5 minute lease. */
export const defaultPolicy = {
  dailyLimit: 50,
  timeZone: 'Europe/Paris',
  lease: 5 * 60 * 1000,
} satisfies ScanAttemptPolicy;

/**
 * The controller wired to real use cases over in-memory ports: its specs are about the HTTP
 * mapping, the adapters have their own specs against the real technologies. Excluded from
 * the app build (`tsconfig.app.json`).
 */
export function aShelfPhotosController(
  overrides: {
    readonly scanner?: ShelfScannerPort;
    readonly storage?: ShelfPhotoStoragePort;
    readonly policy?: ScanAttemptPolicy;
  } = {},
) {
  const memory = new InMemoryPhotoStorage();
  const repository = new InMemoryScanRepository();
  const storage = overrides.storage ?? memory;
  const scanner = overrides.scanner ?? new StubShelfScannerAdapter();
  const owner = unwrap(OwnerId.of('default'));
  const storeShelfPhoto = new StoreShelfPhotoUseCase(owner, storage, repository);
  const scanStoredShelfPhoto = new ScanStoredShelfPhotoUseCase(
    storage,
    repository,
    scanner,
    overrides.policy ?? defaultPolicy,
  );

  const listShelfScans = new ListShelfScansUseCase(owner, repository);
  const getShelfPhotoImage = new GetShelfPhotoImageUseCase(owner, storage, repository);

  return {
    controller: new ShelfPhotosController(
      storeShelfPhoto,
      scanStoredShelfPhoto,
      listShelfScans,
      getShelfPhotoImage,
    ),
    storeShelfPhoto,
    scanStoredShelfPhoto,
    listShelfScans,
    getShelfPhotoImage,
    objects: memory.objects,
    thumbnails: memory.thumbnails,
    records: repository.records,
    repository,
  };
}
