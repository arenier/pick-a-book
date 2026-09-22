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
    expect(env.ownerId).toBe('default');
    expect(env.webOrigin).toBe('http://localhost:4200');
  });

  it('exposes the connection string, under either Postgres scheme', () => {
    expect(loadEnvironment({ ...complete }).databaseUrl).toBe(complete.DATABASE_URL);
    expect(
      loadEnvironment({ ...complete, DATABASE_URL: 'postgres://user@host:5432/db' }).databaseUrl,
    ).toBe('postgres://user@host:5432/db');
  });
});

describe('loadEnvironment, refusing a configuration it cannot work with', () => {
  it('fails when a required variable is missing', () => {
    expect(() => loadEnvironment({})).toThrow(InvalidEnvironment);
    expect(() => loadEnvironment({})).toThrow(/DATABASE_URL/u);
  });

  // The bucket holds the shelf photos the API now keeps (ADR 0004): a missing name would
  // only surface on the first upload, long after the boot that could have named it.
  it('requires the bucket name', () => {
    expect(() => loadEnvironment({ DATABASE_URL: complete.DATABASE_URL })).toThrow(/BUCKET_NAME/u);
    expect(load().bucketName).toBe('pick-a-book-photos');
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

describe('loadEnvironment, where a photo is kept and who may call (ADR 0004)', () => {
  // Not a real account: a fixed segment that already lays the bucket out per owner, so
  // real accounts later change where the value comes from, not the layout (research.md §10).
  it('takes the owner id from the configuration, and defaults it', () => {
    expect(load({ OWNER_ID: 'marguerite' }).ownerId).toBe('marguerite');
    expect(load({ OWNER_ID: '  ' }).ownerId).toBe('default');
  });

  // Absent in production: the SDK then talks to the real bucket. Present locally, it points
  // at the emulator of the compose stack.
  it('exposes the bucket emulator host only when one is configured', () => {
    expect(load().bucketEmulatorHost).toBeUndefined();
    expect(load({ BUCKET_EMULATOR_HOST: 'http://localhost:4443' }).bucketEmulatorHost).toBe(
      'http://localhost:4443',
    );
  });

  // Optional, unlike DATABASE_URL: a missing value has a sensible local default rather than
  // stopping the boot — the frontend and the API only share an origin in production.
  it('takes the web origin from the configuration, and defaults it', () => {
    expect(load({ WEB_ORIGIN: 'https://pick-a-book.example' }).webOrigin).toBe(
      'https://pick-a-book.example',
    );
    expect(load({ WEB_ORIGIN: '' }).webOrigin).toBe('http://localhost:4200');
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
