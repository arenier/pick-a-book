import {
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
} from '@pick-a-book/recognition-application';
import type {
  DetectedBook,
  NewShelfScan,
  ShelfPhoto,
  ShelfPhotoStoragePort,
  ShelfScanId,
  ShelfScanRecord,
  ShelfScanRepositoryPort,
  ShelfScannerPort,
} from '@pick-a-book/recognition-domain';
import { ShelfPhoto as ShelfPhotoValue, ShelfScanFailed } from '@pick-a-book/recognition-domain';
import { StubShelfScannerAdapter } from '@pick-a-book/recognition-infrastructure';
import { describe, expect, it } from 'vitest';

import { ShelfPhotosController } from './shelf-photos.controller';

/** A minimal valid JPEG header — `ShelfPhoto` only checks that the bytes are not empty. */
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const uploadedPhoto = {
  buffer: jpegBytes,
  mimetype: 'image/jpeg',
  originalname: 'IMG_0001.jpg',
};

/**
 * The archive both use cases share, in memory.
 *
 * Not a stand-in for the adapters — those are tested against Postgres and the bucket
 * emulator — but for the archive as a whole, so this suite can say what the controller
 * answers without a live stack behind it.
 */
class InMemoryArchive implements ShelfPhotoStoragePort, ShelfScanRepositoryPort {
  private readonly objects = new Map<string, ShelfPhoto>();
  private readonly records = new Map<ShelfScanId, ShelfScanRecord>();

  async store(photo: ShelfPhoto, key: string): Promise<void> {
    this.objects.set(key, photo);
  }

  async retrieve(key: string): Promise<ShelfPhoto> {
    const photo = this.objects.get(key);
    if (photo === undefined) {
      throw new Error(`No object at ${key}`);
    }

    return photo;
  }

  async createPending(scan: NewShelfScan): Promise<void> {
    this.records.set(scan.id, {
      ...scan,
      status: 'pending',
      detectedBooks: undefined,
      createdAt: new Date(),
    });
  }

  async get(id: ShelfScanId): Promise<ShelfScanRecord | undefined> {
    return this.records.get(id);
  }

  /** How much was kept — zero is what FR-013 asks for on a refused photo. */
  countRecords(): number {
    return this.records.size;
  }

  async markCompleted(id: ShelfScanId, books: readonly DetectedBook[]): Promise<void> {
    const record = this.leavePending(id);
    this.records.set(id, { ...record, status: 'completed', detectedBooks: [...books] });
  }

  async markFailed(id: ShelfScanId): Promise<void> {
    const record = this.leavePending(id);
    this.records.set(id, { ...record, status: 'failed', detectedBooks: undefined });
  }

  private leavePending(id: ShelfScanId): ShelfScanRecord {
    const record = this.records.get(id);
    if (record === undefined || record.status !== 'pending') {
      throw new Error(`Shelf scan ${id} is not pending`);
    }

    return record;
  }
}

const controllerWith = (scanner: ShelfScannerPort = new StubShelfScannerAdapter()) => {
  const archive = new InMemoryArchive();

  return {
    archive,
    controller: new ShelfPhotosController(
      new StoreShelfPhotoUseCase('default', archive, archive),
      new ScanStoredShelfPhotoUseCase(archive, archive, scanner),
    ),
  };
};

const failingScanner: ShelfScannerPort = {
  scan: async (): Promise<never> => {
    throw new ShelfScanFailed('provider unavailable');
  },
};

describe('ShelfPhotosController, storing a photo', () => {
  it('answers with the id the photo was filed under', async () => {
    const { controller } = controllerWith();

    const { id } = await controller.store(uploadedPhoto);

    expect(id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  // FR-015: no endpoint hands back where the photo went, who owns it, or what the file was
  // called — the id is the only thing the frontend ever sees.
  it('answers with nothing but the id', async () => {
    const { controller } = controllerWith();

    const response = await controller.store(uploadedPhoto);

    expect(Object.keys(response)).toStrictEqual(['id']);
  });

  it('keeps the photo before any analysis is attempted', async () => {
    const { controller, archive } = controllerWith();

    const { id } = await controller.store(uploadedPhoto);
    const record = await archive.get(id);

    expect(record?.status).toBe('pending');
    // The key is the use case's, not a secret: it is `{ownerId}/shelf_photo/{id}` by
    // construction, which is what makes the stored photo findable from the id alone.
    await expect(archive.retrieve(`default/shelf_photo/${id}`)).resolves.toBeInstanceOf(
      ShelfPhotoValue,
    );
  });
});

describe('ShelfPhotosController, scanning a stored photo', () => {
  it('returns the detected books', async () => {
    const { controller } = controllerWith();
    const { id } = await controller.store(uploadedPhoto);

    const result = await controller.scan(id);

    expect(result.books.length).toBeGreaterThan(0);
    expect(result.books[0]).toStrictEqual({
      author: 'Marguerite Duras',
      title: "L'Amant",
      confidence: 0.94,
    });
  });

  it('records the result against the photo it was read from', async () => {
    const { controller, archive } = controllerWith();
    const { id } = await controller.store(uploadedPhoto);

    await controller.scan(id);

    expect((await archive.get(id))?.status).toBe('completed');
  });

  // A provider that is down is not the caller's fault: 502 names an upstream failure, where
  // 400 would blame the photo (FR-006).
  it('maps a scan failure to 502', async () => {
    const { controller } = controllerWith(failingScanner);
    const { id } = await controller.store(uploadedPhoto);

    await expect(controller.scan(id)).rejects.toMatchObject({ status: 502 });
  });
});

describe('ShelfPhotosController refuses a bad photo with 400, keeping nothing (FR-013)', () => {
  it('when no file is sent at all', async () => {
    const { controller } = controllerWith();

    await expect(controller.store()).rejects.toMatchObject({ status: 400 });
  });

  it('when the media type is not a supported image', async () => {
    const { controller } = controllerWith();

    await expect(
      controller.store({ buffer: jpegBytes, mimetype: 'application/pdf', originalname: 'a.pdf' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('when the image is empty', async () => {
    const { controller } = controllerWith();

    await expect(
      controller.store({ buffer: Buffer.alloc(0), mimetype: 'image/jpeg', originalname: 'a.jpg' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps no record of a photo it refused', async () => {
    const { controller, archive } = controllerWith();

    await expect(
      controller.store({ buffer: Buffer.alloc(0), mimetype: 'image/jpeg' }),
    ).rejects.toMatchObject({ status: 400 });

    expect(archive.countRecords()).toBe(0);
  });
});

describe('ShelfPhotosController, a scan it will not run', () => {
  it('answers 404 for an id no submission answers to', async () => {
    const { controller } = controllerWith();

    await expect(controller.scan(crypto.randomUUID())).rejects.toMatchObject({ status: 404 });
  });

  it('answers 409 when the scan already answered', async () => {
    const { controller } = controllerWith();
    const { id } = await controller.store(uploadedPhoto);
    await controller.scan(id);

    await expect(controller.scan(id)).rejects.toMatchObject({ status: 409 });
  });

  // US3 scenario 2: the photo and its record outlive the failure of the provider.
  it('keeps the photo and marks the scan failed when the provider is down', async () => {
    const { controller, archive } = controllerWith(failingScanner);
    const { id } = await controller.store(uploadedPhoto);

    await expect(controller.scan(id)).rejects.toMatchObject({ status: 502 });

    expect((await archive.get(id))?.status).toBe('failed');
    expect((await archive.get(id))?.detectedBooks).toBeUndefined();
    await expect(archive.retrieve(`default/shelf_photo/${id}`)).resolves.toBeInstanceOf(
      ShelfPhotoValue,
    );
  });
});
