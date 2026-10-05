import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  OwnerId,
  ShelfScanId,
  ShelfScanNotFound,
} from '@pick-a-book/recognition-domain';
import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { GetShelfScanUseCase } from './get-shelf-scan.use-case.js';
import { StoreShelfPhotoUseCase } from '../store/store-shelf-photo.use-case.js';
import { InMemoryShelfPhotoStorage } from '../../testing/in-memory-shelf-photo-storage.js';
import { InMemoryShelfScanRepository } from '../../testing/in-memory-shelf-scan-repository.js';
import { policy } from '../testing/scan-fixtures.js';

const owner = unwrap(OwnerId.of('default'));

/** The scan and the attempt reserved on it, as the use case that settles the scan holds them. */
async function anAttemptOn(repository: InMemoryShelfScanRepository, id: string) {
  const scanId = unwrap(ShelfScanId.of(id));

  return [scanId, unwrap(await repository.startAttempt(scanId, policy))] as const;
}

const aJpeg = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]),
  mediaType: 'image/jpeg',
  originalFilename: 'IMG_SECRET.jpg',
};

const books = [
  DetectedBook.of(
    unwrap(Author.of('Albert Camus')),
    unwrap(BookTitle.of('La Peste')),
    unwrap(Confidence.of(0.92)),
  ),
  DetectedBook.of(undefined, unwrap(BookTitle.of('Les Choses')), unwrap(Confidence.of(0.71))),
];

/** A scan stored by the first step, and the use case over the same repository. */
async function aStoredScan() {
  const repository = new InMemoryShelfScanRepository();
  const storage = new InMemoryShelfPhotoStorage();
  const { id } = unwrap(
    await new StoreShelfPhotoUseCase(owner, storage, repository).execute(aJpeg),
  );

  return { id, repository, useCase: new GetShelfScanUseCase(owner, repository) };
}

// What the detail of an upload shows (specs/002-upload-history, US2): the books as the analysis
// got them, in the order it gave them (FR-007).
describe('GetShelfScanUseCase, a completed analysis', () => {
  it('answers its books, in the order they were stored, the author left out when unknown', async () => {
    const { id, repository, useCase } = await aStoredScan();
    await repository.markCompleted(...(await anAttemptOn(repository, id)), books);

    const detail = unwrap(await useCase.execute({ id }));

    expect(detail).toStrictEqual({
      id,
      createdAt: detail.createdAt,
      outcome: 'completed',
      books: [
        { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
        { author: undefined, title: 'Les Choses', confidence: 0.71 },
      ],
      hasThumbnail: false,
    });
    expect(new Date(detail.createdAt).toISOString()).toBe(detail.createdAt);
  });

  it('answers an empty list for an analysis that found no book', async () => {
    const { id, repository, useCase } = await aStoredScan();
    await repository.markCompleted(...(await anAttemptOn(repository, id)), []);

    expect(unwrap(await useCase.execute({ id })).books).toStrictEqual([]);
  });
});

describe('GetShelfScanUseCase, an analysis with no books', () => {
  it('answers no books at all for a scan that was never started', async () => {
    const { id, useCase } = await aStoredScan();

    const detail = unwrap(await useCase.execute({ id }));

    expect(detail.outcome).toBe('pending');
    expect(Object.keys(detail)).not.toContain('books');
  });

  it('answers no books at all for a scan that failed', async () => {
    const { id, repository, useCase } = await aStoredScan();
    await repository.markFailed(...(await anAttemptOn(repository, id)));

    const detail = unwrap(await useCase.execute({ id }));

    expect(detail.outcome).toBe('failed');
    expect(Object.keys(detail)).not.toContain('books');
  });
});

describe('GetShelfScanUseCase, what it keeps back and what it does not find', () => {
  // FR-009: not the file name, not the key in the bucket, not the owner.
  it('says nothing of the file, the bucket or the owner', async () => {
    const { id, useCase } = await aStoredScan();

    const text = JSON.stringify(unwrap(await useCase.execute({ id })));

    expect(text).not.toMatch(/IMG_SECRET|shelf_photo|default|originalFilename|ownerId|bucket/u);
  });

  it.each([
    ['an unknown UUID', ShelfScanId.generate().value],
    ['a malformed id', 'not-a-uuid'],
  ])('answers ShelfScanNotFound for %s', async (_label, id) => {
    const { useCase } = await aStoredScan();

    await expect(useCase.execute({ id })).resolves.toStrictEqual(err(new ShelfScanNotFound(id)));
  });

  it("answers ShelfScanNotFound for another owner's scan", async () => {
    const { id, repository } = await aStoredScan();
    const stranger = new GetShelfScanUseCase(unwrap(OwnerId.of('someone-else')), repository);

    await expect(stranger.execute({ id })).resolves.toStrictEqual(err(new ShelfScanNotFound(id)));
  });
});
