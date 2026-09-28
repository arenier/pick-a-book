import { backUpDatabase } from './back-up-database.js';
import { InvalidConfiguration, loadConfiguration } from './configuration.js';
import { openSnapshotBucket } from './snapshot-bucket.js';

/**
 * One execution of the job, as an exit code. Logs one JSON line per outcome — the shape
 * Cloud Logging parses, `severity` included — and never throws: a failure is exit code 1,
 * which fails the Cloud Run execution the freshness alert watches.
 */
export async function runJob(
  env: Readonly<Record<string, string | undefined>>,
  takenAt: Date,
  write: (line: string) => void,
): Promise<number> {
  try {
    const configuration = loadConfiguration(env);
    const outcome = await backUpDatabase({
      databaseUrl: configuration.databaseUrl,
      snapshots: openSnapshotBucket({
        bucketName: configuration.bucketName,
        emulatorHost: configuration.bucketEmulatorHost,
      }),
      generations: configuration.generations,
      takenAt,
    });

    write(JSON.stringify({ severity: 'INFO', message: 'backup completed', ...outcome }));
    return 0;
  } catch (error) {
    // Configuration and dump errors are ours and carry no secret; anything else is reported
    // by its message only, never with a stack or cause that could echo the database URL.
    const reason = error instanceof Error ? error.message : String(error);
    const message = error instanceof InvalidConfiguration ? reason : `backup failed: ${reason}`;
    write(JSON.stringify({ severity: 'ERROR', message }));
    return 1;
  }
}
