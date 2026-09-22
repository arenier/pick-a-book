import type { ShelfPhoto } from './shelf-photo.js';

/**
 * Outbound port for keeping a submitted shelf photo (ADR 0004, ADR 0006).
 *
 * The domain knows neither bucket nor filesystem: it hands over bytes under a key and asks
 * for them back. Which object store is behind it — GCS, an emulator, a map in memory — is an
 * infrastructure concern, as is how the media type travels alongside the bytes.
 *
 * `store` receives the key rather than deriving one: composing
 * `{ownerId}/shelf_photo/{id}` is an application decision (which owner, which identifier),
 * and a port that built its own keys would need to know a configuration that is not its own
 * (specs/001-photo-upload/research.md §10).
 *
 * `retrieve` is given the media type back rather than guessing it from the key: the key
 * carries no extension on purpose — the identifier names the object, the original filename
 * never does (FR-015).
 */
export interface ShelfPhotoStoragePort {
  store(photo: ShelfPhoto, key: string): Promise<void>;
  retrieve(key: string, mediaType: string): Promise<ShelfPhoto>;
}

/**
 * Injection token for the port.
 *
 * A string, not a decorator: the domain depends on no injection container (see
 * `SHELF_SCANNER_PORT`).
 */
export const SHELF_PHOTO_STORAGE_PORT = 'ShelfPhotoStoragePort';
