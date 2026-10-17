import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_FOLDER, testDatabaseUrl } from './drizzle/test-database.js';
import { migrateDatabase } from './migrate-database.js';

/**
 * The rules of the upload history schema (specs/002-upload-history, T003), held by the database
 * itself and not only by the adapter — like the `detected_books` rule of spec 001, they have
 * their own test. Runs against the Postgres of docker-compose, on the committed migrations.
 */
function aMigratedPool() {
  const pool = new Pool({ connectionString: testDatabaseUrl });

  beforeAll(async () => {
    await migrateDatabase(pool, MIGRATIONS_FOLDER);
  });

  afterAll(async () => {
    await pool.end();
  });

  return pool;
}

interface NewUpload {
  readonly type?: string;
  readonly originalFilename: string | null;
  readonly sourceUploadId: string | null;
}

const THUMBNAIL = {
  type: 'shelf_photo_thumbnail',
  originalFilename: null,
} as const;

async function insertUpload(pool: Pool, row: NewUpload): Promise<string> {
  const id = crypto.randomUUID();
  const type = row.type ?? 'shelf_photo';
  await pool.query(
    `insert into uploads
       (id, owner_id, type, bucket_key, media_type, size_bytes, original_filename, source_upload_id)
     values ($1, 'schema-spec', $2, $3, 'image/jpeg', 10, $4, $5)`,
    [id, type, `schema-spec/${type}/${id}`, row.originalFilename, row.sourceUploadId],
  );

  return id;
}

const aPhoto = async (pool: Pool) =>
  insertUpload(pool, { originalFilename: 'IMG_1.jpg', sourceUploadId: null });

describe('the uploads table, for derived files', () => {
  const pool = aMigratedPool();

  it('rejects an upload with neither an original filename nor a source upload', async () => {
    await expect(
      insertUpload(pool, { originalFilename: null, sourceUploadId: null }),
    ).rejects.toThrow(/uploads_source_or_filename_check/u);
  });

  it('rejects an upload with both an original filename and a source upload', async () => {
    const photo = await aPhoto(pool);

    await expect(
      insertUpload(pool, { originalFilename: 'IMG_2.jpg', sourceUploadId: photo }),
    ).rejects.toThrow(/uploads_source_or_filename_check/u);
  });

  it('accepts a thumbnail: no filename, a source upload that exists', async () => {
    const photo = await aPhoto(pool);

    await expect(insertUpload(pool, { ...THUMBNAIL, sourceUploadId: photo })).resolves.toBeTypeOf(
      'string',
    );
  });

  it('rejects a second thumbnail for the same photo', async () => {
    const photo = await aPhoto(pool);
    await insertUpload(pool, { ...THUMBNAIL, sourceUploadId: photo });

    await expect(insertUpload(pool, { ...THUMBNAIL, sourceUploadId: photo })).rejects.toThrow(
      /uploads_source_upload_id_unique/u,
    );
  });

  it('rejects a thumbnail whose source upload does not exist', async () => {
    await expect(
      insertUpload(pool, { ...THUMBNAIL, sourceUploadId: crypto.randomUUID() }),
    ).rejects.toThrow(/uploads_source_upload_id_uploads_id_fk/u);
  });
});

describe('the scan_attempts table', () => {
  const pool = aMigratedPool();

  it('has an id, an upload, a start and a nullable finish', async () => {
    const { rows } = await pool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'scan_attempts'
       order by column_name`,
    );

    expect(rows).toStrictEqual([
      { column_name: 'finished_at', is_nullable: 'YES' },
      { column_name: 'id', is_nullable: 'NO' },
      { column_name: 'started_at', is_nullable: 'NO' },
      { column_name: 'upload_id', is_nullable: 'NO' },
    ]);
  });

  it('refuses an attempt on an upload that does not exist', async () => {
    await expect(
      pool.query('insert into scan_attempts (upload_id) values ($1)', [crypto.randomUUID()]),
    ).rejects.toThrow(/scan_attempts_upload_id_uploads_id_fk/u);
  });

  it('accepts an attempt on an upload that does', async () => {
    const photo = await aPhoto(pool);

    await expect(
      pool.query('insert into scan_attempts (upload_id) values ($1)', [photo]),
    ).resolves.toBeDefined();
  });
});

describe('the indexes of the upload history', () => {
  const pool = aMigratedPool();

  it.each(['uploads_owner_type_created_idx', 'scan_attempts_started_at_idx'])(
    'has the index %s',
    async (name) => {
      const { rows } = await pool.query<{ indexname: string }>(
        'select indexname from pg_indexes where schemaname = $1 and indexname = $2',
        ['public', name],
      );

      expect(rows).toStrictEqual([{ indexname: name }]);
    },
  );

  it('has a partial index on the attempts still open', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
       where schemaname = 'public' and tablename = 'scan_attempts' and indexname = $1`,
      ['scan_attempts_open_upload_idx'],
    );

    expect(rows.map((row) => row.indexdef.includes('WHERE (finished_at IS NULL)'))).toStrictEqual([
      true,
    ]);
  });
});
