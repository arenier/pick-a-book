import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { ShelfPhoto } from '@pick-a-book/recognition-domain';

import { mediaTypeOf } from './config.js';
import { parseGroundTruth } from './lib/ground-truth.js';
import type { GroundTruth } from './lib/ground-truth.js';

/** Reading the reference photos and their ground truth off disk. */
export interface PhotoItem {
  readonly file: string;
  readonly photo: ShelfPhoto;
}

export async function loadPhotos(dir: string): Promise<PhotoItem[]> {
  const entries = (await readdir(dir)).toSorted((left, right) => left.localeCompare(right));
  const loaded = await Promise.all(entries.map(async (entry) => loadPhoto(dir, entry)));
  return loaded.filter((item): item is PhotoItem => item !== undefined);
}

async function loadPhoto(dir: string, entry: string): Promise<PhotoItem | undefined> {
  const mediaType = mediaTypeOf(entry);
  if (mediaType === undefined) {
    return undefined;
  }
  const bytes = new Uint8Array(await readFile(join(dir, entry)));
  return { file: basename(entry), photo: ShelfPhoto.of(bytes, mediaType) };
}

/** The ground truth, or `undefined` when the file is absent — a bench without quality scoring. */
export async function loadGroundTruth(path: string): Promise<GroundTruth | undefined> {
  try {
    return parseGroundTruth(await readFile(path, 'utf8'));
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
