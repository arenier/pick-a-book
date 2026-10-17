import { InMemoryShelfPhotoStorage } from '@pick-a-book/recognition-application/testing';
import { ShelfPhotoStorageFailed } from '@pick-a-book/recognition-infrastructure';

/**
 * The storage double shared with `recognition-application`, told to fail the way the real adapter
 * does for a key that holds nothing: the controller turns that error into a 502 (contracts §3).
 */
export const anInMemoryPhotoStorage = () =>
  new InMemoryShelfPhotoStorage({
    whenMissing: (key) => new ShelfPhotoStorageFailed(`could not retrieve ${key}`),
  });
