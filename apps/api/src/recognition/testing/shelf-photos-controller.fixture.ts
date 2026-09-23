import {
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
} from '@pick-a-book/recognition-application';
import {
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

import { ShelfPhotosController } from '../shelf-photos.controller';

/** In-memory doubles of the two storage ports, holding the transition rules of Postgres. */
function inMemoryPorts() {
  const objects = new Map<string, ShelfPhoto>();
  const records = new Map<string, ShelfScanRecord>();

  const storage: ShelfPhotoStoragePort = {
    store: async (photo, key) => {
      objects.set(key, photo);
    },
    retrieve: async (key, mediaType) =>
      ShelfPhoto.of(objects.get(key)?.bytes ?? new Uint8Array(), mediaType),
  };

  const pending = (id: ShelfScanId): ShelfScanRecord => {
    const record = records.get(id.value);
    if (record === undefined) {
      throw new ShelfScanNotFound(id.value);
    }
    if (record.status !== 'pending') {
      throw new ShelfScanAlreadyProcessed(id);
    }
    return record;
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
      records.set(id.value, { ...pending(id), status: 'completed', detectedBooks: books });
    },
    markFailed: async (id) => {
      records.set(id.value, { ...pending(id), status: 'failed', detectedBooks: undefined });
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
  const storeShelfPhoto = new StoreShelfPhotoUseCase('default', storage, repository);
  const scanStoredShelfPhoto = new ScanStoredShelfPhotoUseCase(storage, repository, scanner);

  return {
    controller: new ShelfPhotosController(storeShelfPhoto, scanStoredShelfPhoto),
    storeShelfPhoto,
    scanStoredShelfPhoto,
    objects,
    records,
  };
}
