import { describe, expect, it } from 'vitest';

import { InvalidEnvironment, loadEnvironment } from './environment';

const complete = {
  DATABASE_URL: 'postgresql://user:secret@db.example.com/neondb?sslmode=require',
  STORAGE_BUCKET: 'pick-a-book-photos',
} satisfies NodeJS.ProcessEnv;

describe('loadEnvironment', () => {
  it('applies the default values', () => {
    const env = loadEnvironment({ ...complete });

    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(3000);
    expect(env.shelfScannerApiKey).toBeUndefined();
  });

  it('exposes the connection string, under either Postgres scheme', () => {
    expect(loadEnvironment({ ...complete }).databaseUrl).toBe(complete.DATABASE_URL);
    expect(
      loadEnvironment({ ...complete, DATABASE_URL: 'postgres://user@host:5432/db' }).databaseUrl,
    ).toBe('postgres://user@host:5432/db');
  });

  it('fails when a required variable is missing', () => {
    expect(() => loadEnvironment({ STORAGE_BUCKET: 'photos' })).toThrow(InvalidEnvironment);
  });

  it('lists every missing variable at once', () => {
    expect(() => loadEnvironment({})).toThrow(/DATABASE_URL[\s\S]*STORAGE_BUCKET/u);
  });

  it('treats an empty variable as absent', () => {
    expect(() => loadEnvironment({ ...complete, DATABASE_URL: '   ' })).toThrow(/DATABASE_URL/u);
  });

  // The filesystem path of the previous persistence is the regression that matters here.
  it('rejects a DATABASE_URL that is not a Postgres connection string', () => {
    const reject = (url: string) => () => loadEnvironment({ ...complete, DATABASE_URL: url });

    expect(reject('/mnt/pick-a-book.sqlite')).toThrow(/DATABASE_URL/u);
    expect(reject('mysql://user@host/db')).toThrow(/DATABASE_URL/u);
  });

  it('rejects a PORT outside its bounds', () => {
    expect(() => loadEnvironment({ ...complete, PORT: '70000' })).toThrow(/PORT/u);
    expect(() => loadEnvironment({ ...complete, PORT: 'eight-thousand' })).toThrow(/PORT/u);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnvironment({ ...complete, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/u);
  });
});
