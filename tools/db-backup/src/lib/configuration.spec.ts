import { describe, expect, it } from 'vitest';

import { InvalidConfiguration, loadConfiguration } from './configuration.js';
import { rejectionOf } from './test-services.js';

const valid = {
  DATABASE_URL: 'postgresql://owner:secret@db.example:5432/app?sslmode=require',
  BACKUP_BUCKET: 'pick-a-book-backups',
  BACKUP_GENERATIONS: '8',
};

describe('loadConfiguration, a valid environment', () => {
  it('reads the database, the bucket and the number of generations to keep', () => {
    expect(loadConfiguration(valid)).toStrictEqual({
      databaseUrl: valid.DATABASE_URL,
      bucketName: 'pick-a-book-backups',
      generations: 8,
      bucketEmulatorHost: undefined,
    });
  });

  it('passes the bucket emulator through when one is given', () => {
    const configuration = loadConfiguration({
      ...valid,
      BUCKET_EMULATOR_HOST: 'http://localhost:4443',
    });

    expect(configuration.bucketEmulatorHost).toBe('http://localhost:4443');
  });
});

describe('loadConfiguration, an invalid environment', () => {
  it('lists every missing variable at once', () => {
    expect(() => loadConfiguration({})).toThrow(
      new InvalidConfiguration([
        'DATABASE_URL is required and is not set',
        'BACKUP_BUCKET is required and is not set',
        'BACKUP_GENERATIONS is required and is not set',
      ]),
    );
  });

  it('refuses a database URL that is not a Postgres connection string', () => {
    expect(() => loadConfiguration({ ...valid, DATABASE_URL: '/var/lib/app.db' })).toThrow(
      /DATABASE_URL is not a Postgres connection string/u,
    );
  });

  // Pruning keeps the N most recent snapshots: zero would delete the one just taken, and a
  // fraction or a typo has no meaning. Refusing at boot beats pruning on a surprise value.
  it.each(['0', '-1', '2.5', 'eight', ''])('refuses %j generations', (generations) => {
    expect(() => loadConfiguration({ ...valid, BACKUP_GENERATIONS: generations })).toThrow(
      /BACKUP_GENERATIONS/u,
    );
  });

  // The message ends up in Cloud Logging: it must never carry the password of the URL.
  it('never echoes the database URL in its errors', async () => {
    const url = 'mysql://owner:hunter2@db.example/app';

    const error = await rejectionOf(
      Promise.resolve().then(() => loadConfiguration({ ...valid, DATABASE_URL: url })),
    );

    expect(error.message).not.toContain('hunter2');
  });
});
