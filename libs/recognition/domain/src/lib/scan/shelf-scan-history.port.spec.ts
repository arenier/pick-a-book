import { describe, expectTypeOf, it } from 'vitest';

import type { OwnerId } from '../owner/owner-id.js';
import type { ShelfScanId } from './shelf-scan-id.js';
import type { ThumbnailMediaType } from '../photo/shelf-photo-thumbnail.js';
import type {
  ShelfScanCursor,
  ShelfScanPage,
  ShelfScanPageQuery,
  ShelfScanRecord,
  ShelfScanRepositoryPort,
  StoredThumbnail,
} from './shelf-scan-repository.port.js';

// What the history reads (specs/002-upload-history, data-model.md): a page of scans, newest
// first, and the thumbnail each one may carry.
describe('ShelfScanRepositoryPort, reading the history', () => {
  it('lists one page of scans for an owner, after a cursor', () => {
    expectTypeOf<ShelfScanRepositoryPort['list']>().toEqualTypeOf<
      (query: ShelfScanPageQuery) => Promise<ShelfScanPage>
    >();
    expectTypeOf<ShelfScanPageQuery['ownerId']>().toEqualTypeOf<OwnerId>();
    expectTypeOf<ShelfScanPageQuery['limit']>().toEqualTypeOf<number>();
    expectTypeOf<ShelfScanPageQuery['after']>().toEqualTypeOf<ShelfScanCursor | undefined>();
  });

  // The cursor is the position of the last scan seen: its date, and its id to break ties.
  it('points at a position by its date and its id', () => {
    expectTypeOf<ShelfScanCursor['createdAt']>().toEqualTypeOf<Date>();
    expectTypeOf<ShelfScanCursor['id']>().toEqualTypeOf<ShelfScanId>();
  });

  it('answers the scans of the page, and where the next one starts if there is one', () => {
    expectTypeOf<ShelfScanPage['records']>().toEqualTypeOf<readonly ShelfScanRecord[]>();
    expectTypeOf<ShelfScanPage['next']>().toEqualTypeOf<ShelfScanCursor | undefined>();
  });
});

describe('ShelfScanRecord, its thumbnail', () => {
  it('may carry the reference of a thumbnail, and says so with undefined when it has none', () => {
    expectTypeOf<ShelfScanRecord['thumbnail']>().toEqualTypeOf<StoredThumbnail | undefined>();
  });

  it('references a thumbnail by its key, its media type and its weight', () => {
    expectTypeOf<StoredThumbnail['bucketKey']>().toEqualTypeOf<string>();
    expectTypeOf<StoredThumbnail['mediaType']>().toEqualTypeOf<ThumbnailMediaType>();
    expectTypeOf<StoredThumbnail['sizeBytes']>().toEqualTypeOf<number>();
  });
});
