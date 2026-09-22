import type {
  NewShelfScan,
  ShelfPhoto,
  ShelfPhotoStoragePort,
  ShelfScanRecord,
  ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';
import { describe, expect, it } from 'vitest';

import { StoreShelfPhotoUseCase } from './store-shelf-photo.use-case.js';

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

const aPhoto = { bytes: jpegBytes, mediaType: 'image/jpeg', originalFilename: 'IMG_0001.jpg' };

const unusedHere = (name: string) => (): never => {
  throw new Error(`${name} is not part of storing a photo`);
};

/** Records what the use case asks of its two ports, and nothing else. */
function useCaseWith(ownerId = 'default') {
  const stored: { photo: ShelfPhoto; key: string }[] = [];
  const created: NewShelfScan[] = [];

  const storage: ShelfPhotoStoragePort = {
    store: async (photo: ShelfPhoto, key: string) => {
      stored.push({ photo, key });
    },
    retrieve: unusedHere('retrieve'),
  };
  const repository: ShelfScanRepositoryPort = {
    createPending: async (scan: NewShelfScan) => {
      created.push(scan);
    },
    get: async (): Promise<ShelfScanRecord | undefined> => undefined,
    markCompleted: unusedHere('markCompleted'),
    markFailed: unusedHere('markFailed'),
  };

  return { stored, created, useCase: new StoreShelfPhotoUseCase(ownerId, storage, repository) };
}

describe('StoreShelfPhotoUseCase', () => {
  it('keeps the photo and answers with the id it was filed under', async () => {
    const { useCase, stored, created } = useCaseWith();

    const { id } = await useCase.execute(aPhoto);

    expect(stored).toHaveLength(1);
    expect(stored[0]?.photo.bytes).toStrictEqual(jpegBytes);
    expect(created).toHaveLength(1);
    expect(created[0]?.id).toBe(id);
  });

  // The key is the use case's to build, not the port's: it is the one place that knows both
  // the owner and the identifier (specs/001-photo-upload/research.md §10).
  it('files the photo under {ownerId}/shelf_photo/{id}', async () => {
    const { useCase, stored } = useCaseWith('marguerite');

    const { id } = await useCase.execute(aPhoto);

    expect(stored[0]?.key).toBe(`marguerite/shelf_photo/${id}`);
  });

  it('gives each submission its own id', async () => {
    const { useCase } = useCaseWith();

    const first = await useCase.execute(aPhoto);
    const second = await useCase.execute(aPhoto);

    expect(first.id).not.toBe(second.id);
  });
});

describe('StoreShelfPhotoUseCase, what it records of the file', () => {
  it('records the owner, the key, the media type, the size and the filename', async () => {
    const { useCase, created } = useCaseWith('marguerite');

    const { id } = await useCase.execute(aPhoto);

    expect(created[0]).toStrictEqual({
      id,
      ownerId: 'marguerite',
      photoBucketKey: `marguerite/shelf_photo/${id}`,
      photoMediaType: 'image/jpeg',
      photoSizeBytes: jpegBytes.byteLength,
      originalFilename: 'IMG_0001.jpg',
    });
  });

  // FR-015: the filename travels to the database and stops there — it names no object, and
  // a `../..` in it has nowhere to land.
  it('never lets the original filename reach the storage key', async () => {
    const { useCase, stored } = useCaseWith();

    const { id } = await useCase.execute({ ...aPhoto, originalFilename: '../../etc/passwd' });

    expect(stored[0]?.key).toBe(`default/shelf_photo/${id}`);
    expect(stored[0]?.key).not.toContain('passwd');
  });
});
