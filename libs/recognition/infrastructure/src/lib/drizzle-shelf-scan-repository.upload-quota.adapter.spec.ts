import {
  DailyUploadQuotaExceeded,
  type NewShelfScan,
  type OwnerId,
  type UploadQuotaPolicy,
} from '@pick-a-book/recognition-domain';
import { err, ok } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import type { DrizzleShelfScanRepositoryAdapter } from './drizzle-shelf-scan-repository.adapter.js';
import { aMigratedRepository, aNewScan, ownerId } from './testing/test-repository.js';

/**
 * The cap on uploads against Postgres (specs/002-upload-history, FR-017, research.md §13). Each
 * test is its own owner, which is what the cap counts per: runs never see each other's uploads.
 */
const policy = { dailyLimit: 2, timeZone: 'Europe/Paris' } satisfies UploadQuotaPolicy;

const anOwner = () => ownerId(`uploads-${crypto.randomUUID()}`);

/** The start of today in Paris, as an instant — what the cap counts from. */
const PARIS_MIDNIGHT =
  "(date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')";

const withThumbnail = (scan: NewShelfScan): NewShelfScan => ({
  ...scan,
  thumbnail: {
    bucketKey: `${scan.ownerId.value}/shelf_photo_thumbnail/${scan.id.value}`,
    mediaType: 'image/jpeg',
    sizeBytes: 41_000,
  },
});

async function uploadsOf(
  repository: DrizzleShelfScanRepositoryAdapter,
  owner: OwnerId,
  count: number,
  thumbnails = false,
) {
  const scans = Array.from({ length: count }, () => aNewScan(owner));
  await Promise.all(
    scans.map(async (scan) => repository.createPending(thumbnails ? withThumbnail(scan) : scan)),
  );

  return scans;
}

describe('DrizzleShelfScanRepositoryAdapter, the quota of uploads', () => {
  const { repository } = aMigratedRepository();

  it('lets an owner with no upload through', async () => {
    await expect(repository.checkUploadQuota(anOwner(), policy)).resolves.toStrictEqual(ok());
  });

  it('lets an owner under the cap through', async () => {
    const owner = anOwner();
    await uploadsOf(repository, owner, 1);

    await expect(repository.checkUploadQuota(owner, policy)).resolves.toStrictEqual(ok());
  });

  it('answers DailyUploadQuotaExceeded once the limit is reached, saying it', async () => {
    const owner = anOwner();
    await uploadsOf(repository, owner, 2);

    await expect(repository.checkUploadQuota(owner, policy)).resolves.toStrictEqual(
      err(new DailyUploadQuotaExceeded(2)),
    );
  });
});

describe('DrizzleShelfScanRepositoryAdapter, what the quota of uploads counts', () => {
  const { repository } = aMigratedRepository();

  it('takes the limit from the policy, not from a constant', async () => {
    const owner = anOwner();
    await uploadsOf(repository, owner, 2);

    await expect(
      repository.checkUploadQuota(owner, { ...policy, dailyLimit: 3 }),
    ).resolves.toStrictEqual(ok());
  });

  // A photo sent with its thumbnail is two `uploads` rows: it is one upload.
  it('counts a photo once, whatever its thumbnail', async () => {
    const owner = anOwner();
    await uploadsOf(repository, owner, 1, true);

    await expect(repository.checkUploadQuota(owner, policy)).resolves.toStrictEqual(ok());
  });

  it("does not count another owner's uploads", async () => {
    await uploadsOf(repository, anOwner(), 2);

    await expect(repository.checkUploadQuota(anOwner(), policy)).resolves.toStrictEqual(ok());
  });
});

describe('DrizzleShelfScanRepositoryAdapter, the turn of the day in Paris, for uploads', () => {
  const { pool, repository } = aMigratedRepository();

  /** Two uploads of one owner, moved by `shift` from midnight in Paris. */
  async function twoUploadsShifted(shift: string) {
    const owner = anOwner();
    const scans = [aNewScan(owner), aNewScan(owner)];
    await Promise.all(scans.map(async (scan) => repository.createPending(scan)));
    await pool.query(
      `update uploads set created_at = ${PARIS_MIDNIGHT} + interval '${shift}'
       where id = any($1)`,
      [scans.map((scan) => scan.id.value)],
    );

    return owner;
  }

  it("does not count yesterday's uploads", async () => {
    const owner = await twoUploadsShifted('-30 minutes');

    await expect(repository.checkUploadQuota(owner, policy)).resolves.toStrictEqual(ok());
  });

  // 00:30 in Paris is still yesterday in UTC: the day is Paris's, not UTC's.
  it('counts an upload made just after midnight in Paris', async () => {
    const owner = await twoUploadsShifted('30 minutes');

    await expect(repository.checkUploadQuota(owner, policy)).resolves.toStrictEqual(
      err(new DailyUploadQuotaExceeded(2)),
    );
  });
});
