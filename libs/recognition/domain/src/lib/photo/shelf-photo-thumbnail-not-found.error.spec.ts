import { describe, expect, it } from 'vitest';

import { ShelfPhotoThumbnailNotFound } from './shelf-photo-thumbnail-not-found.error.js';

describe('ShelfPhotoThumbnailNotFound', () => {
  it('names the scan that has no thumbnail', () => {
    const error = new ShelfPhotoThumbnailNotFound('1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b');

    expect(error.kind).toBe('shelf-photo-thumbnail-not-found');
    expect(error.name).toBe('ShelfPhotoThumbnailNotFound');
    expect(error.message).toBe(
      'Shelf photo thumbnail not found: 1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b',
    );
  });
});
