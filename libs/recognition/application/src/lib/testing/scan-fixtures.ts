import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  OwnerId,
  ShelfScanFailed,
  type ScanAttemptPolicy,
  type ShelfPhoto,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';
import { err, ok, unwrap, type Result } from '@pick-a-book/shared-result';

import { ScanStoredShelfPhotoUseCase } from '../scan/scan-stored-shelf-photo.use-case.js';
import { StoreShelfPhotoUseCase } from '../store/store-shelf-photo.use-case.js';
import { InMemoryShelfPhotoStorage } from '../../testing/in-memory-shelf-photo-storage.js';
import { InMemoryShelfScanRepository } from '../../testing/in-memory-shelf-scan-repository.js';

/**
 * What the specs of `ScanStoredShelfPhotoUseCase` share: a scanner double, a stored photo and
 * the second step wired to the same ports. Compiled with the specs, left out of the lib build.
 */
/** A double of the scanner port: answers as told, and records what it saw. */
export class ShelfScannerStub implements ShelfScannerPort {
  readonly seen: ShelfPhoto[] = [];

  constructor(private answer: Result<DetectedBook[], ShelfScanFailed>) {}

  async scan(photo: ShelfPhoto): Promise<Result<DetectedBook[], ShelfScanFailed>> {
    this.seen.push(photo);
    return this.answer;
  }

  /** The service came back — or went down: what the next scan answers. */
  answerWith(answer: Result<DetectedBook[], ShelfScanFailed>): void {
    this.answer = answer;
  }
}

export const aJpeg = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]),
  mediaType: 'image/jpeg',
  originalFilename: 'IMG_0001.jpg',
};

/** What `apps/api` hands the use case: the cap of the day and the lease of an attempt. */
export const policy = {
  dailyLimit: 50,
  timeZone: 'Europe/Paris',
  lease: 300_000,
} satisfies ScanAttemptPolicy;

/** A photo already stored by the first step, and the second step wired to the same ports. */
export async function aStoredPhoto(
  scanner: ShelfScannerPort,
  options: {
    readonly policy?: ScanAttemptPolicy;
    readonly storage?: InMemoryShelfPhotoStorage;
  } = {},
) {
  const storage = options.storage ?? new InMemoryShelfPhotoStorage();
  const repository = new InMemoryShelfScanRepository();
  const owner = unwrap(OwnerId.of('default'));
  const store = new StoreShelfPhotoUseCase(owner, storage, repository);
  const { id } = unwrap(await store.execute(aJpeg));
  const scanAs = (someone: OwnerId) =>
    new ScanStoredShelfPhotoUseCase(
      someone,
      storage,
      repository,
      scanner,
      options.policy ?? policy,
    );

  return {
    id,
    storage,
    repository,
    /** Another photo, stored through the same ports: the daily cap counts across them. */
    storeAnother: async () => unwrap(await store.execute(aJpeg)).id,
    useCase: scanAs(owner),
    /** The same second step, asked by someone else: the owner is who the use case answers for. */
    scanAs: (someone: OwnerId) => scanAs(someone),
  };
}

export const books = [
  DetectedBook.of(
    unwrap(Author.of('Annie Ernaux')),
    unwrap(BookTitle.of('Les Annees')),
    unwrap(Confidence.of(0.91)),
  ),
  DetectedBook.of(undefined, unwrap(BookTitle.of('Les Choses')), unwrap(Confidence.of(0.4))),
];

export const scanning = (answer: DetectedBook[]) => new ShelfScannerStub(ok(answer));
export const failing = () => new ShelfScannerStub(err(new ShelfScanFailed('provider unavailable')));
