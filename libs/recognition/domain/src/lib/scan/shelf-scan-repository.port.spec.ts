import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { DetectedBook } from '../detection/detected-book.js';
import { InvalidValue } from '../invalid-value.error.js';
import type { OwnerId } from '../owner/owner-id.js';
import type { ShelfPhotoMediaType } from '../photo/shelf-photo.js';
import { ShelfScanAlreadyProcessed } from './shelf-scan-already-processed.error.js';
import { ShelfScanId } from './shelf-scan-id.js';
import { ShelfScanNotFound } from './shelf-scan-not-found.error.js';
import {
  SHELF_SCAN_REPOSITORY_PORT,
  type NewShelfScan,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
  type StoredThumbnail,
} from './shelf-scan-repository.port.js';

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

describe('ShelfScanId', () => {
  it('accepts a UUID', () => {
    expect(unwrap(ShelfScanId.of(anId)).value).toBe(anId);
  });

  it('normalises the case of a UUID', () => {
    expect(unwrap(ShelfScanId.of(anId.toUpperCase())).value).toBe(anId);
  });

  // The id travels in a URL path: anything that is not a UUID never reaches the database.
  it.each(['', 'not-a-uuid', '../1f9c2e3a', `${anId}x`])('rejects %p', (raw) => {
    expect(ShelfScanId.of(raw)).toStrictEqual(
      err(new InvalidValue(`ShelfScanId: not a UUID (${raw})`)),
    );
  });

  it('generates distinct UUIDs', () => {
    const first = ShelfScanId.generate();
    const second = ShelfScanId.generate();

    expect(unwrap(ShelfScanId.of(first.value)).value).toBe(first.value);
    expect(first.equals(second)).toBe(false);
  });
});

describe('ShelfScanRecord', () => {
  it('carries the reference of the stored photo', () => {
    expectTypeOf<ShelfScanRecord['id']>().toEqualTypeOf<ShelfScanId>();
    expectTypeOf<ShelfScanRecord['ownerId']>().toEqualTypeOf<OwnerId>();
    expectTypeOf<ShelfScanRecord['photoBucketKey']>().toEqualTypeOf<string>();
    expectTypeOf<ShelfScanRecord['photoMediaType']>().toEqualTypeOf<ShelfPhotoMediaType>();
    expectTypeOf<ShelfScanRecord['photoSizeBytes']>().toEqualTypeOf<number>();
    expectTypeOf<ShelfScanRecord['originalFilename']>().toEqualTypeOf<string>();
    expectTypeOf<ShelfScanRecord['createdAt']>().toEqualTypeOf<Date>();
  });

  it('is in one of three statuses', () => {
    expectTypeOf<ShelfScanRecord['status']>().toEqualTypeOf<'pending' | 'completed' | 'failed'>();
  });

  // Detected books exist if and only if the scan completed (data-model.md): the union says so,
  // rather than an optional field that could be set on a failed scan.
  it('carries detected books when completed, and only then', () => {
    expectTypeOf<
      Extract<ShelfScanRecord, { status: 'completed' }>['detectedBooks']
    >().toEqualTypeOf<readonly DetectedBook[]>();
    expectTypeOf<
      Extract<ShelfScanRecord, { status: 'pending' | 'failed' }>['detectedBooks']
    >().toEqualTypeOf<undefined>();
  });

  // The thumbnail is the one thing a new scan may go without (specs/002-upload-history).
  it('is created from everything but its status, books and timestamp, the thumbnail optional', () => {
    expectTypeOf<NewShelfScan>().toEqualTypeOf<
      Omit<ShelfScanRecord, 'status' | 'detectedBooks' | 'createdAt' | 'thumbnail'> & {
        readonly thumbnail?: StoredThumbnail;
      }
    >();
  });
});

describe('ShelfScanRepositoryPort', () => {
  it('reads and writes a shelf scan keyed by its id', () => {
    expectTypeOf<ShelfScanRepositoryPort['createPending']>().toEqualTypeOf<
      (scan: NewShelfScan) => Promise<void>
    >();
    expectTypeOf<ShelfScanRepositoryPort['get']>().toEqualTypeOf<
      (id: ShelfScanId) => Promise<ShelfScanRecord | undefined>
    >();
  });

  it('exposes a string injection token', () => {
    expect(SHELF_SCAN_REPOSITORY_PORT).toBe('ShelfScanRepositoryPort');
  });
});

describe('shelf scan errors', () => {
  const id = unwrap(ShelfScanId.of(anId));

  it('names the id that matched no scan', () => {
    const error = new ShelfScanNotFound(anId);

    expect(error.kind).toBe('shelf-scan-not-found');
    expect(error.name).toBe('ShelfScanNotFound');
    expect(error.message).toContain(anId);
  });

  it('names the scan that is no longer pending', () => {
    const error = new ShelfScanAlreadyProcessed(id);

    expect(error.kind).toBe('shelf-scan-already-processed');
    expect(error.name).toBe('ShelfScanAlreadyProcessed');
    expect(error.message).toContain(anId);
  });
});
