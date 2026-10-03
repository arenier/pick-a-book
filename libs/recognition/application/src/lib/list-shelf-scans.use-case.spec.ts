import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  OwnerId,
  ShelfScanId,
  type ShelfScanRecord,
} from '@pick-a-book/recognition-domain';
import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { InvalidShelfScanCursor } from './invalid-shelf-scan-cursor.error.js';
import { InvalidShelfScanPageSize } from './invalid-shelf-scan-page-size.error.js';
import { ListShelfScansUseCase } from './list-shelf-scans.use-case.js';
import { encodeCursor } from './shelf-scan-cursor.js';
import type { ShelfScanPageDto, ShelfScanSummaryDto } from './shelf-scan-history.dto.js';
import { InMemoryShelfScanRepository } from './testing/in-memory-shelf-scan-repository.js';

const owner = unwrap(OwnerId.of('default'));

const aBook = DetectedBook.of(
  unwrap(Author.of('Annie Ernaux')),
  unwrap(BookTitle.of('La Place')),
  unwrap(Confidence.of(0.71)),
);

const BASE_TIME = new Date('2026-09-01T10:00:00.000Z').getTime();

/** A record sent `index` seconds after the first, with the outcome its place in the cycle gives it. */
function aRecord(index: number, ties: boolean): ShelfScanRecord {
  const id = ShelfScanId.generate();
  const stored = {
    id,
    ownerId: owner,
    photoBucketKey: `default/shelf_photo/${id.value}`,
    photoMediaType: 'image/jpeg',
    photoSizeBytes: 100,
    originalFilename: `IMG_${index}.jpg`,
    // With `ties`, every third scan shares its second with the one before: the id breaks it.
    createdAt: new Date(BASE_TIME + (ties ? index - Math.floor((index + 1) / 3) : index) * 1000),
    thumbnail: undefined,
  } as const;

  switch (index % 4) {
    case 0: {
      return { ...stored, status: 'completed', detectedBooks: [aBook, aBook] };
    }
    case 1: {
      return { ...stored, status: 'completed', detectedBooks: [] };
    }
    case 2: {
      return { ...stored, status: 'failed', detectedBooks: undefined };
    }
    default: {
      return { ...stored, status: 'pending', detectedBooks: undefined };
    }
  }
}

/** `count` scans of the owner: books, none, failed, pending, and over again. */
function aHistory(count: number, ties = false) {
  const repository = new InMemoryShelfScanRepository();
  const records = Array.from({ length: count }, (_unused, index) => aRecord(index, ties));
  records.forEach((record) => {
    repository.records.set(record.id.value, record);
  });

  return { repository, records, useCase: new ListShelfScansUseCase(owner, repository) };
}

/** Whether `a` comes before `b` in a history that is newest first, the id breaking a tie. */
function isAhead(a: ShelfScanSummaryDto, b: ShelfScanSummaryDto): boolean {
  return a.createdAt === b.createdAt ? a.id > b.id : a.createdAt > b.createdAt;
}

/** For each scan after the first: is it behind the one before it, as a newest-first list says? */
function neighboursInOrder(items: readonly ShelfScanSummaryDto[]): boolean[] {
  return items.slice(1).map((item, index) => {
    const previous = items.at(index);

    return previous !== undefined && isAhead(previous, item);
  });
}

/** The cursor to ask the next page with, if there is one. */
const nextOf = (page: ShelfScanPageDto): string | undefined => page.nextCursor ?? undefined;

describe('ListShelfScansUseCase, the size of a page', () => {
  it('gives 20 scans when no limit is asked', async () => {
    const { repository, useCase } = aHistory(1);
    const list = vi.spyOn(repository, 'list');

    await useCase.execute({});

    expect(list).toHaveBeenCalledWith({ ownerId: owner, limit: 20, after: undefined });
  });

  it.each([0, -1, 51, 1.5, Number.NaN])('refuses a limit of %s', async (limit) => {
    const { useCase } = aHistory(1);

    await expect(useCase.execute({ limit })).resolves.toStrictEqual(
      err(new InvalidShelfScanPageSize()),
    );
  });

  it.each([1, 50])('accepts a limit of %s', async (limit) => {
    const { useCase } = aHistory(1);

    expect((await useCase.execute({ limit })).ok).toBe(true);
  });
});

describe('ListShelfScansUseCase, a summary', () => {
  it('says the outcome of each scan, and the number of books of a completed one', async () => {
    const { useCase } = aHistory(4);

    const page = unwrap(await useCase.execute({}));

    // Newest first: the cycle is read backwards.
    expect(page.items.map((item) => [item.outcome, item.bookCount])).toStrictEqual([
      ['pending', undefined],
      ['failed', undefined],
      ['completed', 0],
      ['completed', 2],
    ]);
  });

  it('has the date as ISO 8601, and no thumbnail for a scan sent without one', async () => {
    const { records, useCase } = aHistory(1);

    const { items } = unwrap(await useCase.execute({}));

    expect(items).toStrictEqual([
      {
        id: records[0]?.id.value,
        createdAt: '2026-09-01T10:00:00.000Z',
        outcome: 'completed',
        bookCount: 2,
        hasThumbnail: false,
      },
    ]);
  });

  // FR-009: the file name, the key in the bucket and the owner stay inside.
  it('carries nothing about the file, the bucket or the owner', async () => {
    const { useCase } = aHistory(4);

    const text = JSON.stringify(unwrap(await useCase.execute({})));

    expect(text).not.toMatch(/IMG_|shelf_photo|default|originalFilename|ownerId|bucket/u);
  });
});

describe('ListShelfScansUseCase, paging', () => {
  it('has no next cursor on the last page', async () => {
    const { useCase } = aHistory(3);

    expect(unwrap(await useCase.execute({ limit: 3 })).nextCursor).toBeNull();
  });

  it('covers 45 scans in three pages, with no repeat and no gap', async () => {
    const { records, useCase } = aHistory(45, true);

    const first = unwrap(await useCase.execute({ limit: 20 }));
    const second = unwrap(await useCase.execute({ limit: 20, cursor: nextOf(first) }));
    const third = unwrap(await useCase.execute({ limit: 20, cursor: nextOf(second) }));

    const seen = [...first.items, ...second.items, ...third.items].map((item) => item.id);
    expect(third.nextCursor).toBeNull();
    expect(seen).toHaveLength(45);
    expect(new Set(seen)).toStrictEqual(new Set(records.map((record) => record.id.value)));
  });

  it('orders them newest first, the id breaking a tie', async () => {
    const { useCase } = aHistory(12, true);

    const { items } = unwrap(await useCase.execute({ limit: 12 }));

    expect(neighboursInOrder(items)).toStrictEqual(Array.from({ length: 11 }, () => true));
    expect(new Set(items.map((item) => item.createdAt)).size).toBeLessThan(12);
  });
});

describe('ListShelfScansUseCase, the cursor', () => {
  it('refuses a cursor it did not make', async () => {
    const { useCase } = aHistory(1);

    await expect(useCase.execute({ cursor: 'abc!' })).resolves.toStrictEqual(
      err(new InvalidShelfScanCursor()),
    );
  });

  it('hands the repository the cursor it decoded', async () => {
    const { repository, useCase } = aHistory(1);
    const list = vi.spyOn(repository, 'list');
    const after = { createdAt: new Date('2026-09-01T09:00:00.000Z'), id: ShelfScanId.generate() };

    await useCase.execute({ cursor: encodeCursor(after) });

    expect(list).toHaveBeenCalledWith({ ownerId: owner, limit: 20, after });
  });
});
