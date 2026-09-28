import {
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
} from '@pick-a-book/recognition-application';
import {
  OwnerId,
  ShelfPhoto,
  ShelfScanAlreadyProcessed,
  ShelfScanNotFound,
  type ShelfPhotoStoragePort,
  type ShelfScanId,
  type ShelfScannerPort,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';
import { StubShelfScannerAdapter } from '@pick-a-book/recognition-infrastructure';
import { err, ok, unwrap } from '@pick-a-book/shared-result';

import { ShelfPhotosController } from '../shelf-photos.controller';

/** The record an id names, if it is still pending — the transition rule of Postgres. */
function pending(records: ReadonlyMap<string, ShelfScanRecord>, id: ShelfScanId) {
  const record = records.get(id.value);
  if (record === undefined) {
    return err(new ShelfScanNotFound(id.value));
  }
  if (record.status !== 'pending') {
    return err(new ShelfScanAlreadyProcessed(id));
  }

  return ok(record);
}

/** In-memory doubles of the two storage ports, holding the transition rules of Postgres. */
function inMemoryPorts() {
  const objects = new Map<string, ShelfPhoto>();
  const records = new Map<string, ShelfScanRecord>();

  const storage: ShelfPhotoStoragePort = {
    store: async (photo, key) => {
      objects.set(key, photo);
    },
    retrieve: async (key, mediaType) =>
      unwrap(ShelfPhoto.of(objects.get(key)?.bytes ?? new Uint8Array(), mediaType)),
  };

  const repository: ShelfScanRepositoryPort = {
    createPending: async (scan) => {
      records.set(scan.id.value, {
        ...scan,
        status: 'pending',
        detectedBooks: undefined,
        createdAt: new Date(),
      });
    },
    get: async (id) => records.get(id.value),
    markCompleted: async (id, books) => {
      const record = pending(records, id);
      if (!record.ok) {
        return record;
      }
      records.set(id.value, { ...record.value, status: 'completed', detectedBooks: books });
      return ok();
    },
    markFailed: async (id) => {
      const record = pending(records, id);
      if (!record.ok) {
        return record;
      }
      records.set(id.value, { ...record.value, status: 'failed', detectedBooks: undefined });
      return ok();
    },
  };

  return { objects, records, storage, repository };
}

/**
 * The controller wired to real use cases over in-memory ports: its specs are about the HTTP
 * mapping, the adapters have their own specs against the real technologies. Excluded from
 * the app build (`tsconfig.app.json`).
 */
export function aShelfPhotosController(
  overrides: { readonly scanner?: ShelfScannerPort; readonly storage?: ShelfPhotoStoragePort } = {},
) {
  const ports = inMemoryPorts();
  const { objects, records, repository } = ports;
  const storage = overrides.storage ?? ports.storage;
  const scanner = overrides.scanner ?? new StubShelfScannerAdapter();
  const storeShelfPhoto = new StoreShelfPhotoUseCase(
    unwrap(OwnerId.of('default')),
    storage,
    repository,
  );
  const scanStoredShelfPhoto = new ScanStoredShelfPhotoUseCase(storage, repository, scanner);

  return {
    controller: new ShelfPhotosController(storeShelfPhoto, scanStoredShelfPhoto),
    storeShelfPhoto,
    scanStoredShelfPhoto,
    objects,
    records,
  };
}
