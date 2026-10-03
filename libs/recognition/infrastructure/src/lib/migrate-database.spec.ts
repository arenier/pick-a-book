import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_FOLDER, testDatabaseUrl } from './drizzle/test-database.js';
import { migrateDatabase } from './migrate-database.js';

/** Runs against the Postgres of docker-compose (CLAUDE.md: adapters meet the real technology). */
describe('migrateDatabase', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });

  afterAll(async () => {
    await pool.end();
  });

  it('creates the uploads and shelf_scans tables', async () => {
    await migrateDatabase(pool, MIGRATIONS_FOLDER);

    const { rows } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name in ('uploads', 'shelf_scans')
       order by table_name`,
    );
    expect(rows.map((row) => row.table_name)).toStrictEqual(['shelf_scans', 'uploads']);
  });

  // Every boot runs it: a second run must be a no-op, not a failure.
  it('can run again on an up-to-date database', async () => {
    await migrateDatabase(pool, MIGRATIONS_FOLDER);

    await expect(migrateDatabase(pool, MIGRATIONS_FOLDER)).resolves.toBeUndefined();
  });

  // Several instances may boot at once: they queue on the lock instead of racing.
  it('lets concurrent runs through one at a time', async () => {
    await expect(
      Promise.all([
        migrateDatabase(pool, MIGRATIONS_FOLDER),
        migrateDatabase(pool, MIGRATIONS_FOLDER),
      ]),
    ).resolves.toStrictEqual([undefined, undefined]);
  });
});

/**
 * The rules of the upload history schema (specs/002-upload-history, T003), held by the database
 * itself and not only by the adapter — like the `detected_books` rule of spec 001, they have
 * their own test.
 */
describe('the migrated schema of the upload history', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });

  beforeAll(async () => {
    await migrateDatabase(pool, MIGRATIONS_FOLDER);
  });

  afterAll(async () => {
    await pool.end();
  });

  const insertUpload = async (row: {
    readonly id?: string;
    readonly type?: string;
    readonly originalFilename: string | null;
    readonly sourceUploadId: string | null;
  }): Promise<string> => {
    const id = row.id ?? crypto.randomUUID();
    await pool.query(
      `insert into uploads
         (id, owner_id, type, bucket_key, media_type, size_bytes, original_filename, source_upload_id)
       values ($1, 'schema-spec', $2, $3, 'image/jpeg', 10, $4, $5)`,
      [
        id,
        row.type ?? 'shelf_photo',
        `schema-spec/${row.type ?? 'shelf_photo'}/${id}`,
        row.originalFilename,
        row.sourceUploadId,
      ],
    );
    return id;
  };

  it('rejects an upload with neither an original filename nor a source upload', async () => {
    await expect(insertUpload({ originalFilename: null, sourceUploadId: null })).rejects.toThrow(
      /uploads_source_or_filename_check/u,
    );
  });

  it('rejects an upload with both an original filename and a source upload', async () => {
    const photo = await insertUpload({ originalFilename: 'IMG_1.jpg', sourceUploadId: null });

    await expect(
      insertUpload({ originalFilename: 'IMG_2.jpg', sourceUploadId: photo }),
    ).rejects.toThrow(/uploads_source_or_filename_check/u);
  });

  it('accepts a thumbnail: no filename, a source upload that exists', async () => {
    const photo = await insertUpload({ originalFilename: 'IMG_1.jpg', sourceUploadId: null });

    await expect(
      insertUpload({
        type: 'shelf_photo_thumbnail',
        originalFilename: null,
        sourceUploadId: photo,
      }),
    ).resolves.toStrictEqual(expect.any(String));
  });

  it('rejects a second thumbnail for the same photo', async () => {
    const photo = await insertUpload({ originalFilename: 'IMG_1.jpg', sourceUploadId: null });
    await insertUpload({
      type: 'shelf_photo_thumbnail',
      originalFilename: null,
      sourceUploadId: photo,
    });

    await expect(
      insertUpload({
        type: 'shelf_photo_thumbnail',
        originalFilename: null,
        sourceUploadId: photo,
      }),
    ).rejects.toThrow(/uploads_source_upload_id_unique/u);
  });

  it('rejects a thumbnail whose source upload does not exist', async () => {
    await expect(
      insertUpload({
        type: 'shelf_photo_thumbnail',
        originalFilename: null,
        sourceUploadId: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/uploads_source_upload_id_uploads_id_fk/u);
  });

  it('has a scan_attempts table, keyed to uploads, with a nullable finished_at', async () => {
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

    const photo = await insertUpload({ originalFilename: 'IMG_1.jpg', sourceUploadId: null });
    await expect(
      pool.query('insert into scan_attempts (upload_id) values ($1)', [crypto.randomUUID()]),
    ).rejects.toThrow(/scan_attempts_upload_id_uploads_id_fk/u);
    await expect(
      pool.query('insert into scan_attempts (upload_id) values ($1)', [photo]),
    ).resolves.toBeDefined();
  });

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
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain('WHERE (finished_at IS NULL)');
  });
});
