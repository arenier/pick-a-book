import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  type NewShelfScan,
} from '@pick-a-book/recognition-domain';
import { eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleShelfScanRepositoryAdapter } from './drizzle-shelf-scan-repository.adapter.js';
import { shelfScans, uploads } from './drizzle/schema.js';

/**
 * Against the Postgres of `docker-compose.yml`, not a double: an adapter is tested against
 * the real technology (project convention). Everything this adapter is responsible for — the
 * transaction across two tables, the join that rebuilds one record out of them, the
 * `pending`-only update the 409 rests on — lives in SQL, where an in-memory fake would have
 * nothing to say.
 */
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book';

const migrationsFolder = new URL('./drizzle/migrations', import.meta.url).pathname;

let pool: Pool | undefined;
let database: NodePgDatabase;
let repository: DrizzleShelfScanRepositoryAdapter;

/**
 * Opened per suite rather than once for the file: hooks belong inside a `describe` (lint),
 * and a pool each keeps the suites independent of the order they run in. Re-running the
 * migrations is a no-op — they are the very ones production applies, which is what stops the
 * schema under test from drifting from the shipped one.
 */
const openDatabase = async (): Promise<void> => {
  pool = new Pool({ connectionString: databaseUrl });
  database = drizzle(pool);
  await migrate(database, { migrationsFolder });
  repository = new DrizzleShelfScanRepositoryAdapter(database);
};

const closeDatabase = async (): Promise<void> => {
  await pool?.end();
  pool = undefined;
};

const pendingScan = (overrides: Partial<NewShelfScan> = {}): NewShelfScan => {
  const id = crypto.randomUUID();

  return {
    id,
    ownerId: 'default',
    photoBucketKey: `default/shelf_photo/${id}`,
    photoMediaType: 'image/jpeg',
    photoSizeBytes: 4,
    originalFilename: 'IMG_0001.jpg',
    ...overrides,
  };
};

const camus = DetectedBook.of(
  Author.of('Albert Camus'),
  BookTitle.of('La Peste'),
  Confidence.of(0.92),
);
/** A spine with no readable author: the optional half of the contract (ADR 0005). */
const anonymous = DetectedBook.of(undefined, BookTitle.of('Les Choses'), Confidence.of(0.71));

const NOT_PENDING = /is not pending/u;

describe('DrizzleShelfScanRepositoryAdapter, keeping a submission', () => {
  beforeAll(openDatabase);
  afterAll(closeDatabase);

  it('creates a pending record and reads it back whole', async () => {
    const scan = pendingScan();

    await repository.createPending(scan);
    const record = await repository.get(scan.id);

    expect(record).toMatchObject({ ...scan, status: 'pending', detectedBooks: undefined });
    // Its own assertion rather than a matcher inside the object: the timestamp is the
    // database's to set, so what is checked is that one was set at all.
    expect(record?.createdAt).toBeInstanceOf(Date);
  });

  // The two tables are written as one: a photo referenced by no scan, or a scan pointing at
  // no upload, is a state nothing in the application knows how to read back.
  it('writes both tables in a single transaction', async () => {
    const scan = pendingScan();

    await repository.createPending(scan);
    const rows = await database
      .select({ id: uploads.id, type: uploads.type, status: shelfScans.status })
      .from(uploads)
      .innerJoin(shelfScans, eq(shelfScans.uploadId, uploads.id))
      .where(eq(uploads.id, scan.id));

    expect(rows).toStrictEqual([{ id: scan.id, type: 'shelf_photo', status: 'pending' }]);
  });

  it('reports an unknown id as absent, so the caller can answer 404', async () => {
    await expect(repository.get(crypto.randomUUID())).resolves.toBeUndefined();
  });
});

describe('DrizzleShelfScanRepositoryAdapter, recording what the scan answered', () => {
  beforeAll(openDatabase);
  afterAll(closeDatabase);

  it('completes a scan with the books read, author-less spines included', async () => {
    const scan = pendingScan();
    await repository.createPending(scan);

    await repository.markCompleted(scan.id, [camus, anonymous]);
    const record = await repository.get(scan.id);

    expect(record?.status).toBe('completed');
    expect(record?.detectedBooks).toStrictEqual([camus, anonymous]);
  });

  // An empty list is a result — "no book on this shelf" — never an absence of result.
  it('completes a scan that read no book at all', async () => {
    const scan = pendingScan();
    await repository.createPending(scan);

    await repository.markCompleted(scan.id, []);
    const record = await repository.get(scan.id);

    expect(record?.status).toBe('completed');
    expect(record?.detectedBooks).toStrictEqual([]);
  });

  it('fails a scan without attaching books', async () => {
    const scan = pendingScan();
    await repository.createPending(scan);

    await repository.markFailed(scan.id);
    const record = await repository.get(scan.id);

    expect(record?.status).toBe('failed');
    expect(record?.detectedBooks).toBeUndefined();
  });
});

describe('DrizzleShelfScanRepositoryAdapter, leaving pending exactly once', () => {
  beforeAll(openDatabase);
  afterAll(closeDatabase);

  // What the 409 is made of: the update matches on `status = 'pending'`, so a second call
  // changes nothing and says so, rather than overwriting a result already posted.
  it('refuses to complete a scan twice, and keeps the first result', async () => {
    const scan = pendingScan();
    await repository.createPending(scan);
    await repository.markCompleted(scan.id, [camus]);

    await expect(repository.markCompleted(scan.id, [anonymous])).rejects.toThrow(NOT_PENDING);
    expect((await repository.get(scan.id))?.detectedBooks).toStrictEqual([camus]);
  });

  it('refuses to fail a scan that already answered', async () => {
    const scan = pendingScan();
    await repository.createPending(scan);
    await repository.markCompleted(scan.id, [camus]);

    await expect(repository.markFailed(scan.id)).rejects.toThrow(NOT_PENDING);
  });

  it('refuses to complete or fail a scan that does not exist', async () => {
    const absent = crypto.randomUUID();

    await expect(repository.markCompleted(absent, [])).rejects.toThrow(NOT_PENDING);
    await expect(repository.markFailed(absent)).rejects.toThrow(NOT_PENDING);
  });
});

describe('DrizzleShelfScanRepositoryAdapter.connect', () => {
  beforeAll(openDatabase);
  afterAll(closeDatabase);

  // The composition root of `apps/api` holds a connection string, not a pool: the driver
  // stays behind this lib rather than being imported by the app that wires the port to it.
  it('builds a working repository from a connection string, and closes what it opened', async () => {
    const connected = DrizzleShelfScanRepositoryAdapter.connect(databaseUrl);
    const scan = pendingScan();

    await connected.createPending(scan);
    const record = await connected.get(scan.id);
    await connected.close();

    expect(record?.status).toBe('pending');
  });
});

describe('DrizzleShelfScanRepositoryAdapter, what the stored row says of the file (FR-015)', () => {
  beforeAll(openDatabase);
  afterAll(closeDatabase);

  it('persists the owner, media type, size and original filename as given', async () => {
    const id = crypto.randomUUID();
    const scan = pendingScan({
      id,
      ownerId: 'marguerite',
      photoBucketKey: `marguerite/shelf_photo/${id}`,
      photoMediaType: 'image/png',
      photoSizeBytes: 123_456,
      originalFilename: 'IMG_0001 (2).PNG',
    });

    await repository.createPending(scan);
    const record = await repository.get(scan.id);

    expect(record?.ownerId).toBe('marguerite');
    expect(record?.photoMediaType).toBe('image/png');
    expect(record?.photoSizeBytes).toBe(123_456);
    expect(record?.originalFilename).toBe('IMG_0001 (2).PNG');
  });

  // The filename the browser supplied names nothing that is stored: the key is built from
  // the generated id alone, so a nasty filename has nowhere to land.
  it('never lets the original filename reach the stored key', async () => {
    const scan = pendingScan({ originalFilename: '../../etc/passwd' });

    await repository.createPending(scan);
    const [row] = await database
      .select({ bucketKey: uploads.bucketKey, originalFilename: uploads.originalFilename })
      .from(uploads)
      .where(eq(uploads.id, scan.id));

    expect(row.bucketKey).toBe(`default/shelf_photo/${scan.id}`);
    expect(row.bucketKey).not.toContain('passwd');
    expect(row.originalFilename).toBe('../../etc/passwd');
  });
});
