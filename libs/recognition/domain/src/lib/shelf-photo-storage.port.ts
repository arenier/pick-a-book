import type { ShelfPhoto, ShelfPhotoMediaType } from './shelf-photo.js';

/**
 * Outbound port that keeps shelf photos (ADR 0004: a bucket).
 *
 * The port stores under the key it is handed and never builds one: the layout of the bucket
 * (`{ownerId}/shelf_photo/{id}`) is a decision of the use case that stores the photo, not a
 * property of the storage (specs/001-photo-upload, research.md §10).
 *
 * `retrieve` takes the media type back from its caller, which read it from the scan record:
 * keys carry no extension, and the storage is not trusted to say what a photo is.
 */
export interface ShelfPhotoStoragePort {
  store(photo: ShelfPhoto, key: string): Promise<void>;
  retrieve(key: string, mediaType: ShelfPhotoMediaType): Promise<ShelfPhoto>;
}

/** Injection token for the port — a string, the domain knowing no container. */
export const SHELF_PHOTO_STORAGE_PORT = 'ShelfPhotoStoragePort';
