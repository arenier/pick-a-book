import {
  DailyUploadQuotaExceeded,
  OwnerId,
  type UploadQuotaPolicy,
} from '@pick-a-book/recognition-domain';
import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

import { StoreShelfPhotoUseCase } from './store-shelf-photo.use-case.js';
import { InMemoryShelfPhotoStorage } from './testing/in-memory-shelf-photo-storage.js';
import { InMemoryShelfScanRepository } from './testing/in-memory-shelf-scan-repository.js';
import { aJpeg } from './testing/scan-fixtures.js';

/**
 * The day's uploads are capped (specs/002-upload-history, FR-017, research.md §13), and the cap is
 * asked **before** anything is written: a refused upload leaves nothing behind — no object in the
 * bucket, no record.
 */
const TWO_A_DAY = { dailyLimit: 2, timeZone: 'Europe/Paris' } satisfies UploadQuotaPolicy;

const owner = unwrap(OwnerId.of('default'));

function aUseCase(policy: UploadQuotaPolicy = TWO_A_DAY) {
  const storage = new InMemoryShelfPhotoStorage();
  const repository = new InMemoryShelfScanRepository();

  return {
    storage,
    repository,
    useCase: new StoreShelfPhotoUseCase(owner, storage, repository, policy),
  };
}

describe('StoreShelfPhotoUseCase, the quota of uploads', () => {
  it('keeps the uploads under the cap', async () => {
    const { useCase } = aUseCase();

    await useCase.execute(aJpeg);

    expect((await useCase.execute(aJpeg)).ok).toBe(true);
  });

  it('refuses the upload that goes over the cap, saying the cap', async () => {
    const { useCase } = aUseCase();
    await useCase.execute(aJpeg);
    await useCase.execute(aJpeg);

    await expect(useCase.execute(aJpeg)).resolves.toStrictEqual(
      err(new DailyUploadQuotaExceeded(2)),
    );
  });

  it('writes nothing for a refused upload: no photo, no thumbnail, no record', async () => {
    const { storage, repository, useCase } = aUseCase();
    await useCase.execute(aJpeg);
    await useCase.execute(aJpeg);
    const objects = new Map(storage.objects);
    const records = new Map(repository.records);

    await useCase.execute({
      ...aJpeg,
      thumbnail: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 1]), mediaType: 'image/jpeg' },
    });

    expect(storage.objects).toStrictEqual(objects);
    expect(storage.thumbnails.size).toBe(0);
    expect(repository.records).toStrictEqual(records);
  });

  it('asks the cap before it writes the photo', async () => {
    const { storage, repository, useCase } = aUseCase();
    const ask = vi.spyOn(repository, 'checkUploadQuota');
    const write = vi.spyOn(storage, 'store');

    await useCase.execute(aJpeg);

    expect(ask).toHaveBeenCalledBefore(write);
  });

  it('hands the repository the owner and the policy it was built with', async () => {
    const { repository, useCase } = aUseCase();
    const ask = vi.spyOn(repository, 'checkUploadQuota');

    await useCase.execute(aJpeg);

    expect(ask).toHaveBeenCalledWith(owner, TWO_A_DAY);
  });

  // An invalid photo is the caller's mistake, not a use of the day: it is told so, cap or not.
  it('answers an invalid photo as invalid even when the day is used up', async () => {
    const { useCase } = aUseCase({ ...TWO_A_DAY, dailyLimit: 1 });
    await useCase.execute(aJpeg);

    const answer = await useCase.execute({ ...aJpeg, bytes: new Uint8Array() });

    expect(answer).toMatchObject({ ok: false, error: { kind: 'invalid-shelf-photo' } });
  });
});
