import { describe, expect, it } from 'vitest';

import { InvalidEnvironment, loadEnvironment } from './environment';

const complete = {
  DATABASE_URL: 'postgresql://user:secret@db.example.com/neondb?sslmode=require',
  BUCKET_NAME: 'pick-a-book-photos',
} satisfies NodeJS.ProcessEnv;

/** Loads a complete environment, with `overrides` applied on top. */
const load = (overrides: NodeJS.ProcessEnv = {}) => loadEnvironment({ ...complete, ...overrides });

describe('loadEnvironment', () => {
  it('applies the default values', () => {
    const env = load();

    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(3000);
    expect(env.shelfScanner).toStrictEqual({ provider: 'stub' });
  });

  it('exposes the connection string, under either Postgres scheme', () => {
    expect(loadEnvironment({ ...complete }).databaseUrl).toBe(complete.DATABASE_URL);
    expect(
      loadEnvironment({ ...complete, DATABASE_URL: 'postgres://user@host:5432/db' }).databaseUrl,
    ).toBe('postgres://user@host:5432/db');
  });

  it('fails when a required variable is missing', () => {
    expect(() => loadEnvironment({})).toThrow(InvalidEnvironment);
    expect(() => loadEnvironment({})).toThrow(/DATABASE_URL/u);
  });

  it('lists every problem at once', () => {
    // DATABASE_URL missing and NODE_ENV invalid — a single error names both, so one boot
    // surfaces every misconfiguration rather than one per restart.
    expect(() => loadEnvironment({ NODE_ENV: 'staging' })).toThrow(/DATABASE_URL[\s\S]*NODE_ENV/u);
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

describe('loadEnvironment, photo storage (specs/001-photo-upload)', () => {
  it('exposes the bucket that keeps the shelf photos', () => {
    expect(load().bucketName).toBe('pick-a-book-photos');
  });

  // Same contract as DATABASE_URL: the first upload would otherwise be the one to find out.
  it('fails when BUCKET_NAME is missing, naming it', () => {
    expect(() => loadEnvironment({ DATABASE_URL: complete.DATABASE_URL })).toThrow(
      InvalidEnvironment,
    );
    expect(() => loadEnvironment({ DATABASE_URL: complete.DATABASE_URL })).toThrow(/BUCKET_NAME/u);
  });

  it('defaults OWNER_ID to "default"', () => {
    expect(load().ownerId).toBe('default');
    expect(load({ OWNER_ID: '   ' }).ownerId).toBe('default');
  });

  it('carries a configured OWNER_ID', () => {
    expect(load({ OWNER_ID: 'someone' }).ownerId).toBe('someone');
  });

  // The owner segment ends up in a bucket key: a slash would add a level to the layout.
  it('rejects an OWNER_ID that would not be a single key segment', () => {
    expect(() => load({ OWNER_ID: 'a/b' })).toThrow(/OWNER_ID/u);
  });

  // Development only: absent in production, where the SDK talks to the real API.
  it('carries the storage emulator host only when it is set', () => {
    expect(load().storageEmulatorHost).toBeUndefined();
    expect(load({ STORAGE_EMULATOR_HOST: 'http://localhost:4443' }).storageEmulatorHost).toBe(
      'http://localhost:4443',
    );
  });
});

describe('loadEnvironment, CORS origin (ADR 0004: two origins)', () => {
  it('defaults WEB_ORIGIN to the port of `yarn web`', () => {
    expect(load().webOrigin).toBe('http://localhost:4200');
  });

  it('carries a configured WEB_ORIGIN', () => {
    expect(load({ WEB_ORIGIN: 'https://storage.googleapis.com' }).webOrigin).toBe(
      'https://storage.googleapis.com',
    );
  });

  it('rejects a WEB_ORIGIN that is not an http(s) origin', () => {
    expect(() => load({ WEB_ORIGIN: 'localhost:4200' })).toThrow(/WEB_ORIGIN/u);
  });
});

describe('loadEnvironment, shelf scanner selection (ADR 0005)', () => {
  const keys = { GEMINI_API_KEY: 'gemini-key', OPENROUTER_API_KEY: 'openrouter-key' };

  it('defaults to the stub, so the API boots without any provider key', () => {
    expect(load().shelfScanner).toStrictEqual({ provider: 'stub' });
  });

  it('carries the key of the selected provider, and only that one', () => {
    expect(load({ ...keys, SHELF_SCANNER_PROVIDER: 'gemini' }).shelfScanner).toStrictEqual({
      provider: 'gemini',
      apiKey: 'gemini-key',
    });

    expect(load({ ...keys, SHELF_SCANNER_PROVIDER: 'qwen' }).shelfScanner).toStrictEqual({
      provider: 'qwen',
      apiKey: 'openrouter-key',
    });
  });

  // The point of the whole mechanism: a provider selected without its key fails the boot,
  // rather than the first request that reaches the VLM.
  it('fails when the selected provider has no key', () => {
    expect(() => load({ SHELF_SCANNER_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY/u);
    expect(() => load({ SHELF_SCANNER_PROVIDER: 'qwen' })).toThrow(/OPENROUTER_API_KEY/u);
  });

  it('does not require a provider key the selection does not use', () => {
    expect(() => load({ SHELF_SCANNER_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })).not.toThrow();
  });

  it('rejects an unknown provider, naming the ones it accepts', () => {
    expect(() => load({ SHELF_SCANNER_PROVIDER: 'claude' })).toThrow(
      /SHELF_SCANNER_PROVIDER[\s\S]*gemini[\s\S]*qwen[\s\S]*stub/u,
    );
  });

  // Regression: the generic key predates the per-provider ones and named no provider, so a
  // leftover value would silently select nothing.
  it('ignores the retired generic key', () => {
    expect(load({ SHELF_SCANNER_API_KEY: 'leftover' }).shelfScanner).toStrictEqual({
      provider: 'stub',
    });
  });
});
