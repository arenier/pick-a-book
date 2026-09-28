import { type Bucket, Storage } from '@google-cloud/storage';

import { SNAPSHOT_PREFIX } from './snapshot-name.js';

/** The backups bucket, reduced to what the job does with it. */
export class SnapshotBucket {
  constructor(private readonly bucket: Bucket) {}

  /**
   * Never overwrites: generation 0 matches an absent object only, so an existing name fails
   * the upload instead of replacing an older snapshot.
   */
  async upload(file: string, name: string): Promise<void> {
    await this.bucket.upload(file, {
      destination: name,
      contentType: 'application/octet-stream',
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  }

  async list(): Promise<string[]> {
    const [files] = await this.bucket.getFiles({ prefix: SNAPSHOT_PREFIX });

    return files.map((file) => file.name);
  }

  async delete(name: string): Promise<void> {
    await this.bucket.file(name).delete();
  }
}

/**
 * The real API with the ambient credentials (the job's service account), or the emulator
 * when its URL is given.
 */
export function openSnapshotBucket(options: {
  readonly bucketName: string;
  readonly emulatorHost: string | undefined;
}): SnapshotBucket {
  const storage =
    options.emulatorHost === undefined
      ? new Storage()
      : new Storage({ apiEndpoint: options.emulatorHost });

  return new SnapshotBucket(storage.bucket(options.bucketName));
}
